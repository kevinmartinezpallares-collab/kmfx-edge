//+------------------------------------------------------------------+
//| KMFXConnector v2.76                                              |
//| KMFX Edge — MT5 connector híbrido                                |
//|                                                                  |
//| Backend = policy, estado de riesgo y snapshot operativo          |
//| EA      = sincronización + enforcement local defensivo           |
//|                                                                  |
//| Diseñado para:                                                   |
//| - SAFE_MODE    -> prop-safe, bloqueo preventivo, poca intrusión  |
//| - PROTECT_MODE -> protección activa para cuentas propias         |
//+------------------------------------------------------------------+
#property copyright "KMFX Edge"
#property version   "2.76"
#property strict

#include <Trade/Trade.mqh>

#define KMFX_CONNECTOR_VERSION "2.76"
#define KMFX_CONNECTION_CONFIG_FILE "kmfx_connection.conf"

// -------------------------------------------------------------------
// Modos de enforcement
// -------------------------------------------------------------------
enum KMFXConnectorMode
  {
   SAFE_MODE    = 0,
   PROTECT_MODE = 1
  };

enum KMFXSeverity
  {
   KMFX_SEVERITY_INFO     = 0,
   KMFX_SEVERITY_WARNING  = 1,
   KMFX_SEVERITY_HIGH     = 2,
   KMFX_SEVERITY_CRITICAL = 3
  };

// -------------------------------------------------------------------
// Inputs principales
// -------------------------------------------------------------------
input KMFXConnectorMode KMFXMode              = SAFE_MODE;
input string            KMFXBackendBaseUrl    = "http://127.0.0.1:8766";
input string            KMFXSyncPath          = "/mt5/sync";
input string            KMFXJournalPath       = "/mt5/journal";
input string            KMFXPolicyPath        = "/mt5/policy";
input string            KMFXApiKey            = "";
input string            connection_key        = "";
input int               KMFXTimerMs           = 2000;
input int               KMFXPolicyPollSeconds = 12;
input int               KMFXStatePushSeconds  = 5;
input int               KMFXWebTimeoutMs      = 1500;
input int               KMFXClosedDealsLimit  = 100;
input int               KMFXHistoryPointsLimit= 120;
input int               KMFXHistoryLookbackDays = 365;
input int               KMFXJournalBatchSize  = 20;
input bool              KMFXVerboseLog        = false;
input bool              KMFXEnableEnforce     = true;
input bool              KMFXSendClosedDeals   = true;
input bool              KMFXUseBrokerTime     = true;

string g_runtime_connection_key="";
datetime g_last_connection_key_file_check_at=0;

// -------------------------------------------------------------------
// Estado runtime
// -------------------------------------------------------------------
struct KMFXPolicyCache
  {
   bool      loaded;
   bool      backend_connected;
   bool      degraded_mode;
   bool      panic_lock_active;
   bool      close_all_required;
   bool      auto_block;
   bool      volatility_override_active;
   string    risk_status;
   string    blocking_rule;
   string    action_required;
   string    enforcement_mode;
   string    current_level;
   string    recommended_level;
   string    reason_code;
   string    severity;
   string    policy_hash;
   string    allowed_symbols_csv;
   string    allowed_sessions_csv;
   double    max_risk_per_trade_pct;
   double    max_volume;
   double    daily_dd_hard_stop;
   double    total_dd_hard_stop;
   double    equity_protection_limit;
   datetime  panic_lock_expires_at;
   datetime  last_sync_at;
   datetime  last_good_sync_at;
  };

struct KMFXRuntimeState
  {
   bool      initialized;
   bool      trading_frozen;
   bool      close_all_in_progress;
   bool      hard_stop_triggered;
   string    freeze_reason;
   datetime  last_state_push_at;
   datetime  last_policy_poll_at;
   datetime  last_hard_stop_check_at;
   datetime  last_close_all_at;
   datetime  last_day_reset_at;
   string    current_day_key;
   double    daily_start_equity;
   double    daily_peak_equity;
   double    equity_peak;
   string    last_log_signature;
   string    last_error;
  };

struct KMFXPendingSync
  {
   string    sync_id;
   string    payload;
   int       attempts;
   datetime  created_at;
   datetime  next_retry_at;
  };

struct KMFXPendingJournalBatch
  {
   string    batch_id;
   string    trade_ids_csv;
   string    payload;
   int       attempts;
   datetime  created_at;
   datetime  next_retry_at;
  };

struct KMFXOrderIntent
  {
   string symbol;
   string side;
   double volume;
   double entry_price;
   double stop_loss;
   double take_profit;
   double risk_pct;
   double risk_amount;
   string strategy_tag;
  };

struct KMFXValidationResult
  {
   bool   allowed;
   string reason_code;
   string message;
   string suggested_action;
  };

struct KMFXEntryDealInfo
  {
   bool   found;
   string direction;
   double open_volume;
   double open_price;
   long   open_time_unix;
   string open_time;
   double sl;
   double tp;
   string comment;
   double commission;
   double swap;
  };

CTrade           Trade;
KMFXPolicyCache  Policy;
KMFXRuntimeState Runtime;

// -------------------------------------------------------------------
// Utilidades base
// -------------------------------------------------------------------
datetime KMFXNow()
  {
   return KMFXUseBrokerTime ? TimeTradeServer() : TimeGMT();
  }

string KMFXNowIso()
  {
   return TimeToString(KMFXNow(),TIME_DATE|TIME_SECONDS);
  }

datetime KMFXHistoryFromTime()
  {
   if(KMFXHistoryLookbackDays<=0)
      return 0;
   return KMFXNow()-(datetime)(86400*KMFXHistoryLookbackDays);
  }

string KMFXModeName()
  {
   return KMFXMode==PROTECT_MODE ? "PROTECT_MODE" : "SAFE_MODE";
  }

string KMFXTrim(string value)
  {
   string output=value;
   StringTrimLeft(output);
   StringTrimRight(output);
   return output;
  }

void KMFXResetEntryDealInfo(KMFXEntryDealInfo &info)
  {
   info.found=false;
   info.direction="";
   info.open_volume=0.0;
   info.open_price=0.0;
   info.open_time_unix=0;
   info.open_time="";
   info.sl=0.0;
   info.tp=0.0;
   info.comment="";
   info.commission=0.0;
   info.swap=0.0;
  }

string KMFXCleanComment(string raw_comment)
  {
   string trimmed=KMFXTrim(raw_comment);
   if(StringLen(trimmed)==0)
      return "";

   string lower=trimmed;
   StringToLower(lower);

   if(StringFind(lower,"[sl")>=0)
      return "";
   if(StringFind(lower,"[tp")>=0)
      return "";
   if(lower=="sl" || lower=="tp")
      return "";
   if(lower=="so" || lower=="so:")
      return "";
   if(lower=="mt5 sync")
      return "";

   return trimmed;
  }

string KMFXDealDirection(long deal_type)
  {
   if(deal_type==DEAL_TYPE_BUY)
      return "BUY";
   if(deal_type==DEAL_TYPE_SELL)
      return "SELL";
   return "";
  }

bool KMFXFindEntryDeal(string position_id,
                       KMFXEntryDealInfo &entry_map[],
                       string &position_ids[],
                       int map_size,
                       KMFXEntryDealInfo &result)
  {
   KMFXResetEntryDealInfo(result);
   string needle=KMFXTrim(position_id);
   if(StringLen(needle)==0 || map_size<=0)
      return false;

   for(int i=0;i<map_size;i++)
     {
      if(position_ids[i]==needle)
        {
         result=entry_map[i];
         return true;
        }
     }

   return false;
  }

double KMFXEntryCostShareRatio(KMFXEntryDealInfo &entry_info,double close_volume)
  {
   if(!entry_info.found || entry_info.open_volume<=0.0 || close_volume<=0.0)
      return 0.0;

   double ratio=close_volume/entry_info.open_volume;
   if(!MathIsValidNumber(ratio))
      return 0.0;

   return MathMax(0.0,MathMin(1.0,ratio));
  }

void KMFXBuildEntryMap(datetime from_time,
                       datetime to_time,
                       KMFXEntryDealInfo &entry_map[],
                       string &position_ids[],
                       int &map_size)
  {
   ArrayResize(entry_map,0);
   ArrayResize(position_ids,0);
   map_size=0;

   if(!HistorySelect(from_time,to_time))
      return;

   int total=HistoryDealsTotal();
   for(int i=0;i<total;i++)
     {
      if(map_size>=2000)
         break;

      ulong ticket=HistoryDealGetTicket(i);
      if(ticket==0)
         continue;

      if(HistoryDealGetInteger(ticket,DEAL_ENTRY)!=DEAL_ENTRY_IN)
         continue;

      long position_id_long=HistoryDealGetInteger(ticket,DEAL_POSITION_ID);
      if(position_id_long<=0)
         continue;

      string position_id=IntegerToString(position_id_long);
      KMFXEntryDealInfo existing;
      if(KMFXFindEntryDeal(position_id,entry_map,position_ids,map_size,existing))
         continue;

      KMFXEntryDealInfo info;
      KMFXResetEntryDealInfo(info);
      info.found=true;
      info.direction=KMFXDealDirection(HistoryDealGetInteger(ticket,DEAL_TYPE));
      info.open_volume=HistoryDealGetDouble(ticket,DEAL_VOLUME);
      info.open_price=HistoryDealGetDouble(ticket,DEAL_PRICE);
      info.open_time_unix=(long)HistoryDealGetInteger(ticket,DEAL_TIME);
      info.open_time=TimeToString((datetime)info.open_time_unix,TIME_DATE|TIME_SECONDS);
      info.sl=HistoryDealGetDouble(ticket,DEAL_SL);
      info.tp=HistoryDealGetDouble(ticket,DEAL_TP);
      info.comment=HistoryDealGetString(ticket,DEAL_COMMENT);
      info.commission=HistoryDealGetDouble(ticket,DEAL_COMMISSION);
      info.swap=HistoryDealGetDouble(ticket,DEAL_SWAP);

      ArrayResize(entry_map,map_size+1);
      ArrayResize(position_ids,map_size+1);
      entry_map[map_size]=info;
      position_ids[map_size]=position_id;
      map_size++;
     }
  }

string KMFXEscapeJson(string value)
  {
   string escaped=value;
   StringReplace(escaped,"\\","\\\\");
   StringReplace(escaped,"\"","\\\"");
   StringReplace(escaped,"\r","\\r");
   StringReplace(escaped,"\n","\\n");
   StringReplace(escaped,"\t","\\t");
   return escaped;
  }

string KMFXQuote(string value)
  {
   return "\""+KMFXEscapeJson(value)+"\"";
  }

string KMFXBoolJson(bool value)
  {
   return value ? "true" : "false";
  }

string KMFXDoubleJson(double value,int digits=2)
  {
   if(!MathIsValidNumber(value))
      value=0.0;
   return DoubleToString(value,digits);
  }

string KMFXAccountLoginString()
  {
   long login = (long)AccountInfoInteger(ACCOUNT_LOGIN);
   string helper_login = IntegerToString(login);
   if(KMFXVerboseLog)
      PrintFormat("[KMFX][DEBUG] ACCOUNT_LOGIN raw=%I64d helper=%s", login, helper_login);
   return helper_login;
  }

string KMFXLoadConnectionKeyFromFile()
  {
   int handle=FileOpen(KMFX_CONNECTION_CONFIG_FILE,FILE_READ|FILE_TXT|FILE_ANSI);
   if(handle==INVALID_HANDLE)
      return "";

   while(!FileIsEnding(handle))
     {
      string line=KMFXTrim(FileReadString(handle));
      if(StringFind(line,"connection_key=")==0)
        {
         string file_key=KMFXTrim(StringSubstr(line,StringLen("connection_key=")));
         FileClose(handle);
         return file_key;
        }
     }

   FileClose(handle);
   return "";
  }

void KMFXInitializeRuntimeConnectionKey()
  {
   string explicit_key=KMFXTrim(connection_key);
   if(StringLen(explicit_key)>0)
     {
      g_runtime_connection_key="";
      PrintFormat("[KMFX][INIT][KEY_SOURCE] source=input key=%s",explicit_key);
      return;
     }

   g_runtime_connection_key=KMFXLoadConnectionKeyFromFile();
   if(StringLen(g_runtime_connection_key)>0)
     {
      PrintFormat("[KMFX][INIT][KEY_SOURCE] source=file key=%s",g_runtime_connection_key);
      return;
     }

   string legacy_key=KMFXTrim(KMFXApiKey);
   if(StringLen(legacy_key)>0)
     {
      PrintFormat("[KMFX][INIT][KEY_SOURCE] source=legacy key=%s",legacy_key);
      return;
     }

   Print("[KMFX][INIT][KEY_SOURCE] source=empty key=");
  }

void KMFXRefreshRuntimeConnectionKey()
  {
   if(StringLen(KMFXTrim(connection_key))>0)
      return;

   datetime now=KMFXNow();
   if(g_last_connection_key_file_check_at>0 && (now-g_last_connection_key_file_check_at)<60)
      return;
   g_last_connection_key_file_check_at=now;

   string file_key=KMFXLoadConnectionKeyFromFile();
   if(StringLen(file_key)>0 && file_key!=g_runtime_connection_key)
     {
      string previous_key=g_runtime_connection_key;
      g_runtime_connection_key=file_key;
      PrintFormat("[KMFX][RUNTIME][KEY_REFRESH] previous=%s current=%s",previous_key,g_runtime_connection_key);
     }
  }

string KMFXBuildSyncId()
  {
   string resolved_key=KMFXConnectionKeyValue();
   string identity=StringLen(resolved_key)>0 ? resolved_key : KMFXAccountLoginString();
   return identity+"-"+IntegerToString((int)KMFXNow())+"-"+IntegerToString((int)GetTickCount());
  }

string KMFXConnectionKeyValue()
  {
   string explicit_key=KMFXTrim(connection_key);
   if(StringLen(explicit_key)>0)
      return explicit_key;

   string runtime_key=KMFXTrim(g_runtime_connection_key);
   if(StringLen(runtime_key)>0)
      return runtime_key;

   string legacy_key=KMFXTrim(KMFXApiKey);
   return legacy_key;
  }

bool KMFXHasConnectionKey()
  {
   return StringLen(KMFXConnectionKeyValue())>0;
  }

string KMFXPendingSyncPrefix()
  {
   return "KMFX_PENDING_SYNC_";
  }

string KMFXPendingSyncFileName(string sync_id)
  {
   return KMFXPendingSyncPrefix()+sync_id+".txt";
  }

int KMFXPendingSyncQueueLimit()
  {
   return 20;
  }

int KMFXPendingSyncMaxAttempts()
  {
   return 6;
  }

int KMFXPendingSyncBackoffSeconds(int attempts)
  {
   int delay=5;
   for(int i=1;i<attempts;i++)
      delay*=2;
   if(delay>120)
      delay=120;
   return delay;
  }

bool KMFXSavePendingSync(KMFXPendingSync &item)
  {
   int handle=FileOpen(KMFXPendingSyncFileName(item.sync_id),FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle==INVALID_HANDLE)
      return false;

   FileWriteString(handle,item.sync_id+"\n");
   FileWriteString(handle,IntegerToString(item.attempts)+"\n");
   FileWriteString(handle,IntegerToString((int)item.created_at)+"\n");
   FileWriteString(handle,IntegerToString((int)item.next_retry_at)+"\n");
   FileWriteString(handle,item.payload);
   FileClose(handle);
   return true;
  }

bool KMFXLoadPendingSync(string file_name,KMFXPendingSync &item)
  {
   int handle=FileOpen(file_name,FILE_READ|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle==INVALID_HANDLE)
      return false;

   item.sync_id=KMFXTrim(FileReadString(handle));
   item.attempts=(int)StringToInteger(KMFXTrim(FileReadString(handle)));
   item.created_at=(datetime)StringToInteger(KMFXTrim(FileReadString(handle)));
   item.next_retry_at=(datetime)StringToInteger(KMFXTrim(FileReadString(handle)));
   item.payload=FileReadString(handle);
   FileClose(handle);
   return StringLen(item.sync_id)>0 && StringLen(item.payload)>0;
  }

bool KMFXDeletePendingSyncFile(string file_name)
  {
   return FileDelete(file_name,FILE_COMMON);
  }

int KMFXCountPendingSyncFiles()
  {
   int count=0;
   string file_name="";
   long handle=FileFindFirst(KMFXPendingSyncPrefix()+"*.txt",file_name,FILE_COMMON);
   if(handle==INVALID_HANDLE)
      return 0;

   do
     {
      count++;
     }
   while(FileFindNext(handle,file_name));

   FileFindClose(handle);
   return count;
  }

bool KMFXDropOldestPendingSync()
  {
   string file_name="";
   string oldest_file="";
   datetime oldest_created_at=0;
   long handle=FileFindFirst(KMFXPendingSyncPrefix()+"*.txt",file_name,FILE_COMMON);
   if(handle==INVALID_HANDLE)
      return false;

   do
     {
      KMFXPendingSync item;
      if(!KMFXLoadPendingSync(file_name,item))
         continue;
      if(oldest_created_at==0 || item.created_at<oldest_created_at)
        {
         oldest_created_at=item.created_at;
         oldest_file=file_name;
        }
     }
   while(FileFindNext(handle,file_name));

   FileFindClose(handle);

   if(StringLen(oldest_file)==0)
      return false;

   KMFXPendingSync dropped_item;
   KMFXLoadPendingSync(oldest_file,dropped_item);
   if(KMFXDeletePendingSyncFile(oldest_file))
     {
      PrintFormat("[KMFX][SYNC][DROPPED] sync_id=%s reason=queue_limit attempts=%d", dropped_item.sync_id, dropped_item.attempts);
      return true;
     }

   return false;
  }

bool KMFXQueuePendingSync(string sync_id,string payload,int attempts)
  {
   if(KMFXCountPendingSyncFiles()>=KMFXPendingSyncQueueLimit())
      KMFXDropOldestPendingSync();

   KMFXPendingSync item;
   item.sync_id=sync_id;
   item.payload=payload;
   item.attempts=attempts;
   item.created_at=KMFXNow();
   item.next_retry_at=KMFXNow()+(datetime)KMFXPendingSyncBackoffSeconds(attempts);

   if(!KMFXSavePendingSync(item))
      return false;

   PrintFormat("[KMFX][SYNC][QUEUED] sync_id=%s attempts=%d next_retry=%s", item.sync_id, item.attempts, TimeToString(item.next_retry_at,TIME_DATE|TIME_SECONDS));
   return true;
  }

string KMFXPendingJournalPrefix()
  {
   return "KMFX_PENDING_JOURNAL_";
  }

string KMFXPendingJournalFileName(string batch_id)
  {
   return KMFXPendingJournalPrefix()+batch_id+".txt";
  }

string KMFXSentTradeMarkerPrefix()
  {
   return "KMFX_SENT_TRADE_";
  }

string KMFXSentTradeMarkerFileName(string trade_id)
  {
   return KMFXSentTradeMarkerPrefix()+trade_id+".txt";
  }

string KMFXBuildJournalBatchId()
  {
   string identity=KMFXHasConnectionKey() ? KMFXConnectionKeyValue() : KMFXAccountLoginString();
   return "batch-"+identity+"-"+IntegerToString((int)KMFXNow())+"-"+IntegerToString((int)GetTickCount());
  }

bool KMFXIsTradeSent(string trade_id)
  {
   int handle=FileOpen(KMFXSentTradeMarkerFileName(trade_id),FILE_READ|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle==INVALID_HANDLE)
      return false;
   FileClose(handle);
   return true;
  }

bool KMFXMarkTradeSent(string trade_id)
  {
   int handle=FileOpen(KMFXSentTradeMarkerFileName(trade_id),FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle==INVALID_HANDLE)
      return false;
   FileWriteString(handle,"sent");
   FileClose(handle);
   return true;
  }

bool KMFXSavePendingJournalBatch(KMFXPendingJournalBatch &item)
  {
   int handle=FileOpen(KMFXPendingJournalFileName(item.batch_id),FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle==INVALID_HANDLE)
      return false;

   FileWriteString(handle,item.batch_id+"\n");
   FileWriteString(handle,item.trade_ids_csv+"\n");
   FileWriteString(handle,IntegerToString(item.attempts)+"\n");
   FileWriteString(handle,IntegerToString((int)item.created_at)+"\n");
   FileWriteString(handle,IntegerToString((int)item.next_retry_at)+"\n");
   FileWriteString(handle,item.payload);
   FileClose(handle);
   return true;
  }

bool KMFXLoadPendingJournalBatch(string file_name,KMFXPendingJournalBatch &item)
  {
   int handle=FileOpen(file_name,FILE_READ|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle==INVALID_HANDLE)
      return false;

   item.batch_id=KMFXTrim(FileReadString(handle));
   item.trade_ids_csv=KMFXTrim(FileReadString(handle));
   item.attempts=(int)StringToInteger(KMFXTrim(FileReadString(handle)));
   item.created_at=(datetime)StringToInteger(KMFXTrim(FileReadString(handle)));
   item.next_retry_at=(datetime)StringToInteger(KMFXTrim(FileReadString(handle)));
   item.payload=FileReadString(handle);
   FileClose(handle);
   return StringLen(item.batch_id)>0 && StringLen(item.payload)>0;
  }

bool KMFXDeletePendingJournalFile(string file_name)
  {
   return FileDelete(file_name,FILE_COMMON);
  }

bool KMFXTradeIsQueued(string trade_id)
  {
   string file_name="";
   long handle=FileFindFirst(KMFXPendingJournalPrefix()+"*.txt",file_name,FILE_COMMON);
   if(handle==INVALID_HANDLE)
      return false;

   bool queued=false;
   do
     {
      KMFXPendingJournalBatch item;
      if(!KMFXLoadPendingJournalBatch(file_name,item))
         continue;
      if(KMFXSplitCsvContains(item.trade_ids_csv,trade_id))
        {
         queued=true;
         break;
        }
     }
   while(FileFindNext(handle,file_name));

   FileFindClose(handle);
   return queued;
  }

void KMFXMarkTradeCsvAsSent(string trade_ids_csv)
  {
   string items[];
   int count=StringSplit(trade_ids_csv,',',items);
   for(int i=0;i<count;i++)
     {
      string trade_id=KMFXTrim(items[i]);
      if(StringLen(trade_id)>0)
         KMFXMarkTradeSent(trade_id);
     }
  }

void KMFXLog(string scope,string message,bool force=false)
  {
   if(!KMFXVerboseLog && !force && scope!="ERROR")
      return;

   string signature=scope+"|"+message;
   if(signature==Runtime.last_log_signature && !force && scope!="ERROR")
      return;

   Runtime.last_log_signature=signature;
   Print("[KMFX][",scope,"] ",message);
  }

void KMFXSetError(string message)
  {
   Runtime.last_error=message;
   KMFXLog("ERROR",message,true);
  }

string KMFXSeverityString(KMFXSeverity severity)
  {
   if(severity==KMFX_SEVERITY_CRITICAL) return "critical";
   if(severity==KMFX_SEVERITY_HIGH)     return "high";
   if(severity==KMFX_SEVERITY_WARNING)  return "warning";
   return "info";
  }

KMFXSeverity KMFXParseSeverity(string value)
  {
   string normalized=KMFXTrim(value);
   StringToLower(normalized);
   if(normalized=="critical") return KMFX_SEVERITY_CRITICAL;
   if(normalized=="high")     return KMFX_SEVERITY_HIGH;
   if(normalized=="warning")  return KMFX_SEVERITY_WARNING;
   return KMFX_SEVERITY_INFO;
  }

string KMFXDayKey(datetime when_time)
  {
   MqlDateTime dt;
   TimeToStruct(when_time,dt);
   return StringFormat("%04d-%02d-%02d",dt.year,dt.mon,dt.day);
  }

void KMFXResetDailyContextIfNeeded()
  {
   datetime now_time=KMFXNow();
   string today_key=KMFXDayKey(now_time);
   double equity=AccountInfoDouble(ACCOUNT_EQUITY);

   if(StringLen(Runtime.current_day_key)==0)
     {
      Runtime.current_day_key=today_key;
      Runtime.daily_start_equity=equity;
      Runtime.daily_peak_equity=equity;
      Runtime.last_day_reset_at=now_time;
      KMFXLog("STATE","Contexto diario inicializado.");
      return;
     }

   if(Runtime.current_day_key!=today_key)
     {
      Runtime.current_day_key=today_key;
      Runtime.daily_start_equity=equity;
      Runtime.daily_peak_equity=equity;
      Runtime.last_day_reset_at=now_time;
      Runtime.hard_stop_triggered=false;
      Runtime.freeze_reason="";
      if(!Policy.panic_lock_active)
         Runtime.trading_frozen=false;
      KMFXLog("STATE","Reset diario aplicado para nueva sesión operativa.",true);
      return;
     }

   if(equity>Runtime.daily_peak_equity)
      Runtime.daily_peak_equity=equity;
  }

double KMFXDailyDrawdownPct()
  {
   if(Runtime.daily_start_equity<=0.0)
      return 0.0;
   double current_equity=AccountInfoDouble(ACCOUNT_EQUITY);
   double dd=MathMax(Runtime.daily_start_equity-current_equity,0.0);
   return (dd/Runtime.daily_start_equity)*100.0;
  }

double KMFXTotalDrawdownPct()
  {
   double equity=AccountInfoDouble(ACCOUNT_EQUITY);
   if(equity>Runtime.equity_peak)
      Runtime.equity_peak=equity;
   if(Runtime.equity_peak<=0.0)
      return 0.0;
   double dd=MathMax(Runtime.equity_peak-equity,0.0);
   return (dd/Runtime.equity_peak)*100.0;
  }

bool KMFXSplitCsvContains(string csv,string value)
  {
   if(StringLen(KMFXTrim(csv))==0)
      return false;

   string items[];
   int count=StringSplit(csv,',',items);
   string needle=KMFXTrim(value);
   StringToUpper(needle);
   for(int i=0;i<count;i++)
     {
      string item=KMFXTrim(items[i]);
      StringToUpper(item);
      if(item==needle)
         return true;
     }
   return false;
  }

bool KMFXIsSessionAllowed()
  {
   if(StringLen(KMFXTrim(Policy.allowed_sessions_csv))==0)
      return true;

   MqlDateTime dt;
   TimeToStruct(KMFXNow(),dt);
   int hour=dt.hour;

   bool asia=(hour>=0 && hour<8);
   bool london=(hour>=7 && hour<16);
   bool new_york=(hour>=12 && hour<21);

   if(asia && KMFXSplitCsvContains(Policy.allowed_sessions_csv,"Asia"))
      return true;
   if(london && KMFXSplitCsvContains(Policy.allowed_sessions_csv,"London"))
      return true;
   if(new_york && KMFXSplitCsvContains(Policy.allowed_sessions_csv,"New York"))
      return true;

   return false;
  }

string KMFXSideFromPositionType(long position_type)
  {
   return position_type==POSITION_TYPE_BUY ? "BUY" : "SELL";
  }

string KMFXSideFromOrderType(ENUM_ORDER_TYPE order_type)
  {
   if(order_type==ORDER_TYPE_BUY || order_type==ORDER_TYPE_BUY_LIMIT || order_type==ORDER_TYPE_BUY_STOP || order_type==ORDER_TYPE_BUY_STOP_LIMIT)
      return "BUY";
   return "SELL";
  }

datetime KMFXParseIsoUtc(string value)
  {
   if(StringLen(value)<10)
      return 0;

   string normalized=value;
   StringReplace(normalized,"T"," ");
   int plus_pos=StringFind(normalized,"+");
   if(plus_pos>0)
      normalized=StringSubstr(normalized,0,plus_pos);
   int z_pos=StringFind(normalized,"Z");
   if(z_pos>0)
      normalized=StringSubstr(normalized,0,z_pos);

   return StringToTime(normalized);
  }

double KMFXEstimateRiskAmount(string symbol,string side,double volume,double entry_price,double stop_loss)
  {
   if(stop_loss<=0.0 || entry_price<=0.0 || volume<=0.0)
      return 0.0;

   ENUM_ORDER_TYPE order_type=(side=="BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double profit=0.0;
   if(!OrderCalcProfit(order_type,symbol,volume,entry_price,stop_loss,profit))
      return 0.0;
   return MathAbs(profit);
  }

double KMFXEstimateRiskPct(string symbol,string side,double volume,double entry_price,double stop_loss)
  {
   double balance=AccountInfoDouble(ACCOUNT_BALANCE);
   if(balance<=0.0)
      return 0.0;
   return (KMFXEstimateRiskAmount(symbol,side,volume,entry_price,stop_loss)/balance)*100.0;
  }

// -------------------------------------------------------------------
// Serialización MT5 -> JSON
// -------------------------------------------------------------------
string KMFXBuildReportMetrics(datetime from_time,datetime to_time)
  {
   double gross_profit=0.0;
   double gross_loss=0.0;
   double net_profit=0.0;
   double total_commission=0.0;
   double total_swap=0.0;
   double best_trade=0.0;
   double worst_trade=0.0;
   int total_trades=0;
   int win_count=0;
   int loss_count=0;
   int current_wins=0;
   int current_losses=0;
   int max_consecutive_wins=0;
   int max_consecutive_losses=0;
   bool first_trade=true;
   bool first_balance_found=false;
   double first_balance_deal=0.0;
   double trade_nets[];
   KMFXEntryDealInfo entry_map[];
   string position_ids[];
   int entry_map_size=0;
   KMFXBuildEntryMap(from_time,to_time,entry_map,position_ids,entry_map_size);

   if(HistorySelect(from_time,to_time))
     {
      int total=HistoryDealsTotal();
      for(int i=0;i<total;i++)
        {
         ulong ticket=HistoryDealGetTicket(i);
         if(ticket==0)
            continue;

         long deal_type=HistoryDealGetInteger(ticket,DEAL_TYPE);
         if(deal_type==DEAL_TYPE_BALANCE && !first_balance_found)
           {
            first_balance_deal=HistoryDealGetDouble(ticket,DEAL_PROFIT);
            if(MathIsValidNumber(first_balance_deal))
               first_balance_found=true;
           }

         long entry=HistoryDealGetInteger(ticket,DEAL_ENTRY);
         if(entry!=DEAL_ENTRY_OUT)
            continue;

         double profit=HistoryDealGetDouble(ticket,DEAL_PROFIT);
         double close_commission=HistoryDealGetDouble(ticket,DEAL_COMMISSION);
         double close_swap=HistoryDealGetDouble(ticket,DEAL_SWAP);
         double close_volume=HistoryDealGetDouble(ticket,DEAL_VOLUME);
         long position_id_long=HistoryDealGetInteger(ticket,DEAL_POSITION_ID);
         string position_id=IntegerToString(position_id_long);
         KMFXEntryDealInfo entry_info;
         KMFXFindEntryDeal(position_id,entry_map,position_ids,entry_map_size,entry_info);
         double entry_ratio=KMFXEntryCostShareRatio(entry_info,close_volume);
         double entry_commission=entry_info.found ? entry_info.commission*entry_ratio : 0.0;
         double entry_swap=entry_info.found ? entry_info.swap*entry_ratio : 0.0;
         if(!MathIsValidNumber(profit))
            profit=0.0;
         if(!MathIsValidNumber(close_commission))
            close_commission=0.0;
         if(!MathIsValidNumber(close_swap))
            close_swap=0.0;
         if(!MathIsValidNumber(entry_commission))
            entry_commission=0.0;
         if(!MathIsValidNumber(entry_swap))
            entry_swap=0.0;
         double commission=close_commission+entry_commission;
         double swap=close_swap+entry_swap;
         if(!MathIsValidNumber(commission))
            commission=0.0;
         if(!MathIsValidNumber(swap))
            swap=0.0;

         double net=profit+commission+swap;
         if(!MathIsValidNumber(net))
            net=0.0;

         ArrayResize(trade_nets,total_trades+1);
         trade_nets[total_trades]=net;
         total_trades++;

         net_profit+=net;
         total_commission+=commission;
         total_swap+=swap;

         if(first_trade)
           {
            best_trade=net;
            worst_trade=net;
            first_trade=false;
           }
         else
           {
            best_trade=MathMax(best_trade,net);
            worst_trade=MathMin(worst_trade,net);
           }

         if(net>0.0)
           {
            gross_profit+=net;
            win_count++;
            current_wins++;
            current_losses=0;
            max_consecutive_wins=MathMax(max_consecutive_wins,current_wins);
           }
         else
            if(net<0.0)
              {
               gross_loss+=net;
               loss_count++;
               current_losses++;
               current_wins=0;
               max_consecutive_losses=MathMax(max_consecutive_losses,current_losses);
              }
            else
              {
               current_wins=0;
               current_losses=0;
              }
        }
     }

   double start_balance=AccountInfoDouble(ACCOUNT_BALANCE)-net_profit;
   if(from_time==0 && first_balance_found)
      start_balance=first_balance_deal;
   if(!MathIsValidNumber(start_balance))
      start_balance=0.0;

   double running_balance=start_balance;
   double balance_peak=start_balance;
   double max_balance_dd_pct=0.0;
   int net_count=ArraySize(trade_nets);
   for(int n=0;n<net_count;n++)
     {
      running_balance+=trade_nets[n];
      balance_peak=MathMax(balance_peak,running_balance);
      double dd_amount=MathMax(balance_peak-running_balance,0.0);
      double dd_pct=balance_peak>0.0 ? (dd_amount/balance_peak)*100.0 : 0.0;
      if(MathIsValidNumber(dd_pct))
         max_balance_dd_pct=MathMax(max_balance_dd_pct,dd_pct);
     }

   double win_rate=total_trades>0 ? ((double)win_count/(double)total_trades)*100.0 : 0.0;
   double profit_factor=0.0;
   if(gross_loss!=0.0)
      profit_factor=gross_profit/MathAbs(gross_loss);
   else
      if(gross_profit>0.0)
         profit_factor=9999.0;
   double avg_win=win_count>0 ? gross_profit/(double)win_count : 0.0;
   double avg_loss=loss_count>0 ? MathAbs(gross_loss)/(double)loss_count : 0.0;

   string json="{";
   json+="\"source\":\"mt5_mql5_computed\",";
   json+="\"balance\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_BALANCE),2)+",";
   json+="\"equity\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_EQUITY),2)+",";
   json+="\"startBalance\":"+KMFXDoubleJson(start_balance,2)+",";
   json+="\"netProfit\":"+KMFXDoubleJson(net_profit,2)+",";
   json+="\"grossProfit\":"+KMFXDoubleJson(gross_profit,2)+",";
   json+="\"grossLoss\":"+KMFXDoubleJson(gross_loss,2)+",";
   json+="\"profitFactor\":"+KMFXDoubleJson(profit_factor,4)+",";
   json+="\"winRate\":"+KMFXDoubleJson(win_rate,2)+",";
   json+="\"totalTrades\":"+IntegerToString(total_trades)+",";
   json+="\"winTrades\":"+IntegerToString(win_count)+",";
   json+="\"lossTrades\":"+IntegerToString(loss_count)+",";
   json+="\"avgWin\":"+KMFXDoubleJson(avg_win,2)+",";
   json+="\"avgLoss\":"+KMFXDoubleJson(avg_loss,2)+",";
   json+="\"bestTrade\":"+KMFXDoubleJson(best_trade,2)+",";
   json+="\"worstTrade\":"+KMFXDoubleJson(worst_trade,2)+",";
   json+="\"drawdownPct\":"+KMFXDoubleJson(max_balance_dd_pct,4)+",";
   json+="\"commissions\":"+KMFXDoubleJson(total_commission,2)+",";
   json+="\"swaps\":"+KMFXDoubleJson(total_swap,2)+",";
   json+="\"dividends\":0,";
   json+="\"maxConsecutiveWins\":"+IntegerToString(max_consecutive_wins)+",";
   json+="\"maxConsecutiveLosses\":"+IntegerToString(max_consecutive_losses)+",";
   json+="\"maxConsecutiveProfit\":0,";
   json+="\"maxConsecutiveLoss\":0";
   json+="}";
   return json;
  }

string KMFXBuildAccountJson()
  {
   string json="{";
   json+="\"login\":"+KMFXAccountLoginString()+",";
   json+="\"name\":"+KMFXQuote(AccountInfoString(ACCOUNT_NAME))+",";
   json+="\"broker\":"+KMFXQuote(AccountInfoString(ACCOUNT_COMPANY))+",";
   json+="\"server\":"+KMFXQuote(AccountInfoString(ACCOUNT_SERVER))+",";
   json+="\"currency\":"+KMFXQuote(AccountInfoString(ACCOUNT_CURRENCY))+",";
   json+="\"balance\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_BALANCE),2)+",";
   json+="\"equity\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_EQUITY),2)+",";
   json+="\"margin\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_MARGIN),2)+",";
   json+="\"free_margin\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_MARGIN_FREE),2)+",";
   json+="\"profit\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_PROFIT),2)+",";
   json+="\"leverage\":"+IntegerToString((int)AccountInfoInteger(ACCOUNT_LEVERAGE))+",";
   json+="\"margin_level\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_MARGIN_LEVEL),2)+",";
   json+="\"timestamp\":"+KMFXQuote(KMFXNowIso());
   json+="}";
   return json;
  }

string KMFXBuildPositionsJson()
  {
   string json="[";
   bool first=true;
   int total=PositionsTotal();

   for(int i=0;i<total;i++)
     {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;

      string symbol=PositionGetString(POSITION_SYMBOL);
      string side=KMFXSideFromPositionType(PositionGetInteger(POSITION_TYPE));
      double volume=PositionGetDouble(POSITION_VOLUME);
      double entry_price=PositionGetDouble(POSITION_PRICE_OPEN);
      double current_price=PositionGetDouble(POSITION_PRICE_CURRENT);
      double stop_loss=PositionGetDouble(POSITION_SL);
      double take_profit=PositionGetDouble(POSITION_TP);
      double floating_profit=PositionGetDouble(POSITION_PROFIT);
      double position_swap=PositionGetDouble(POSITION_SWAP);
      double floating_pnl=floating_profit+position_swap;
      double risk_amount=KMFXEstimateRiskAmount(symbol,side,volume,entry_price,stop_loss);
      double risk_pct=KMFXEstimateRiskPct(symbol,side,volume,entry_price,stop_loss);

      if(!first)
         json+=",";
      first=false;

      json+="{";
      json+="\"position_id\":"+KMFXQuote((string)ticket)+",";
      json+="\"ticket\":"+IntegerToString((int)ticket)+",";
      json+="\"symbol\":"+KMFXQuote(symbol)+",";
      json+="\"type\":"+KMFXQuote(side)+",";
      json+="\"volume\":"+KMFXDoubleJson(volume,2)+",";
      json+="\"price_open\":"+KMFXDoubleJson(entry_price,_Digits)+",";
      json+="\"price_current\":"+KMFXDoubleJson(current_price,_Digits)+",";
      json+="\"sl\":"+KMFXDoubleJson(stop_loss,_Digits)+",";
      json+="\"tp\":"+KMFXDoubleJson(take_profit,_Digits)+",";
      json+="\"profit\":"+KMFXDoubleJson(floating_profit,2)+",";
      json+="\"swap\":"+KMFXDoubleJson(position_swap,2)+",";
      // POSITION_COMMISSION not available in MT5 API
      json+="\"floating_pnl\":"+KMFXDoubleJson(floating_pnl,2)+",";
      json+="\"risk_amount\":"+KMFXDoubleJson(risk_amount,2)+",";
      json+="\"risk_pct\":"+KMFXDoubleJson(risk_pct,4)+",";
      json+="\"strategy_tag\":"+KMFXQuote(PositionGetString(POSITION_COMMENT))+",";
      json+="\"time\":"+KMFXQuote(TimeToString((datetime)PositionGetInteger(POSITION_TIME),TIME_DATE|TIME_SECONDS))+",";
      json+="\"time_unix\":"+IntegerToString((long)PositionGetInteger(POSITION_TIME));
      json+="}";
     }

   json+="]";
   return json;
  }

bool KMFXSymbolListContains(string &symbols[],int count,string symbol)
  {
   for(int i=0;i<count;i++)
     {
      if(symbols[i]==symbol)
         return true;
     }
   return false;
  }

void KMFXAddSymbolSpecCandidate(string symbol,string &symbols[],int &count,int max_count)
  {
   if(StringLen(symbol)==0 || count>=max_count)
      return;
   if(KMFXSymbolListContains(symbols,count,symbol))
      return;
   if(!SymbolInfoInteger(symbol,SYMBOL_SELECT))
      return;
   ArrayResize(symbols,count+1);
   symbols[count]=symbol;
   count++;
  }

string KMFXBuildSingleSymbolSpecJson(string symbol)
  {
   if(StringLen(symbol)==0 || !SymbolInfoInteger(symbol,SYMBOL_SELECT))
      return "";

   double point=SymbolInfoDouble(symbol,SYMBOL_POINT);
   double tick_size=SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_SIZE);
   double tick_value=SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_VALUE);
   double tick_value_profit=SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_VALUE_PROFIT);
   double tick_value_loss=SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_VALUE_LOSS);
   double contract_size=SymbolInfoDouble(symbol,SYMBOL_TRADE_CONTRACT_SIZE);
   double volume_min=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
   double volume_max=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MAX);
   double volume_step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP);

   if(!MathIsValidNumber(point) || point<=0)
      return "";
   if(!MathIsValidNumber(tick_size) || tick_size<=0)
      tick_size=point;
   if(!MathIsValidNumber(tick_value))
      tick_value=0.0;
   if(!MathIsValidNumber(tick_value_profit))
      tick_value_profit=0.0;
   if(!MathIsValidNumber(tick_value_loss))
      tick_value_loss=0.0;
   if(!MathIsValidNumber(contract_size))
      contract_size=0.0;
   if(!MathIsValidNumber(volume_min))
      volume_min=0.0;
   if(!MathIsValidNumber(volume_max))
      volume_max=0.0;
   if(!MathIsValidNumber(volume_step))
      volume_step=0.0;

   string json="{";
   json+="\"symbol\":"+KMFXQuote(symbol)+",";
   json+="\"digits\":"+IntegerToString((int)SymbolInfoInteger(symbol,SYMBOL_DIGITS))+",";
   json+="\"point\":"+KMFXDoubleJson(point,8)+",";
   json+="\"tickSize\":"+KMFXDoubleJson(tick_size,8)+",";
   json+="\"tickValue\":"+KMFXDoubleJson(tick_value,8)+",";
   json+="\"tickValueProfit\":"+KMFXDoubleJson(tick_value_profit,8)+",";
   json+="\"tickValueLoss\":"+KMFXDoubleJson(tick_value_loss,8)+",";
   json+="\"contractSize\":"+KMFXDoubleJson(contract_size,8)+",";
   json+="\"volumeMin\":"+KMFXDoubleJson(volume_min,8)+",";
   json+="\"volumeMax\":"+KMFXDoubleJson(volume_max,8)+",";
   json+="\"volumeStep\":"+KMFXDoubleJson(volume_step,8)+",";
   json+="\"currencyProfit\":"+KMFXQuote(SymbolInfoString(symbol,SYMBOL_CURRENCY_PROFIT))+",";
   json+="\"currencyMargin\":"+KMFXQuote(SymbolInfoString(symbol,SYMBOL_CURRENCY_MARGIN))+",";
   json+="\"tradeCalcMode\":"+IntegerToString((int)SymbolInfoInteger(symbol,SYMBOL_TRADE_CALC_MODE))+",";
   json+="\"spread\":"+IntegerToString((int)SymbolInfoInteger(symbol,SYMBOL_SPREAD))+",";
   json+="\"accountCurrency\":"+KMFXQuote(AccountInfoString(ACCOUNT_CURRENCY));
   json+="}";
   return json;
  }

string KMFXBuildSymbolSpecsJson()
  {
   const int max_symbols=40;
   string symbols[];
   int count=0;

   for(int i=0;i<PositionsTotal();i++)
     {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      KMFXAddSymbolSpecCandidate(PositionGetString(POSITION_SYMBOL),symbols,count,max_symbols);
     }

   datetime from_time=KMFXHistoryFromTime();
   datetime to_time=KMFXNow();
   if(HistorySelect(from_time,to_time))
     {
      int total=HistoryDealsTotal();
      for(int i=total-1;i>=0 && count<max_symbols;i--)
        {
         ulong ticket=HistoryDealGetTicket(i);
         if(ticket==0)
            continue;
         KMFXAddSymbolSpecCandidate(HistoryDealGetString(ticket,DEAL_SYMBOL),symbols,count,max_symbols);
        }
     }

   string common_symbols[]={"EURUSD","GBPUSD","USDJPY","XAUUSD","NAS100","US100","US30","US500","SPX500"};
   for(int i=0;i<ArraySize(common_symbols) && count<max_symbols;i++)
      KMFXAddSymbolSpecCandidate(common_symbols[i],symbols,count,max_symbols);

   string json="{";
   bool first=true;
   for(int i=0;i<count;i++)
     {
      string spec_json=KMFXBuildSingleSymbolSpecJson(symbols[i]);
      if(StringLen(spec_json)==0)
         continue;
      if(!first)
         json+=",";
      first=false;
      json+=KMFXQuote(symbols[i])+":"+spec_json;
     }
   json+="}";
   return json;
  }

string KMFXBuildJournalTradesJson(int max_count,string &trade_ids_csv)
  {
   trade_ids_csv="";
   if(!KMFXSendClosedDeals || max_count<=0)
      return "[]";

   datetime to_time=KMFXNow();
   datetime from_time=KMFXHistoryFromTime();
   if(!HistorySelect(from_time,to_time))
      return "[]";

   string json="[";
   bool first=true;
   int total=HistoryDealsTotal();
   int added=0;
   KMFXEntryDealInfo entry_map[];
   string position_ids[];
   int entry_map_size=0;
   KMFXBuildEntryMap(from_time,to_time,entry_map,position_ids,entry_map_size);

   for(int i=total-1;i>=0;i--)
     {
      if(max_count>0 && added>=max_count)
         break;

      ulong ticket=HistoryDealGetTicket(i);
      if(ticket==0)
         continue;

      string trade_id=(string)ticket;
      if(KMFXIsTradeSent(trade_id) || KMFXTradeIsQueued(trade_id))
         continue;

      long entry=HistoryDealGetInteger(ticket,DEAL_ENTRY);
      if(entry!=DEAL_ENTRY_OUT)
         continue;

      if(!first)
         json+=",";
      first=false;
      added++;
      if(StringLen(trade_ids_csv)>0)
         trade_ids_csv+=",";
      trade_ids_csv+=trade_id;

      long position_id_long=HistoryDealGetInteger(ticket,DEAL_POSITION_ID);
      string position_id=IntegerToString(position_id_long);
      KMFXEntryDealInfo entry_info;
      KMFXFindEntryDeal(position_id,entry_map,position_ids,entry_map_size,entry_info);
      string cleaned_comment=KMFXCleanComment(HistoryDealGetString(ticket,DEAL_COMMENT));
      if(StringLen(cleaned_comment)==0 && entry_info.found)
         cleaned_comment=KMFXCleanComment(entry_info.comment);
      double close_commission=HistoryDealGetDouble(ticket,DEAL_COMMISSION);
      double close_swap=HistoryDealGetDouble(ticket,DEAL_SWAP);
      double close_volume=HistoryDealGetDouble(ticket,DEAL_VOLUME);
      double entry_ratio=KMFXEntryCostShareRatio(entry_info,close_volume);
      double entry_commission=entry_info.found ? entry_info.commission*entry_ratio : 0.0;
      double entry_swap=entry_info.found ? entry_info.swap*entry_ratio : 0.0;
      if(!MathIsValidNumber(close_commission))
         close_commission=0.0;
      if(!MathIsValidNumber(close_swap))
         close_swap=0.0;
      if(!MathIsValidNumber(entry_commission))
         entry_commission=0.0;
      if(!MathIsValidNumber(entry_swap))
         entry_swap=0.0;
      double total_commission=close_commission+entry_commission;
      double total_swap=close_swap+entry_swap;
      double trade_profit=HistoryDealGetDouble(ticket,DEAL_PROFIT);
      if(!MathIsValidNumber(trade_profit))
         trade_profit=0.0;
      double trade_net=trade_profit+total_commission+total_swap;
      if(!MathIsValidNumber(trade_net))
         trade_net=0.0;

      json+="{";
      json+="\"trade_id\":"+KMFXQuote(trade_id)+",";
      json+="\"ticket\":"+IntegerToString((int)ticket)+",";
      json+="\"position_id\":"+position_id+",";
      json+="\"symbol\":"+KMFXQuote(HistoryDealGetString(ticket,DEAL_SYMBOL))+",";
      json+="\"type\":"+KMFXQuote(HistoryDealGetInteger(ticket,DEAL_TYPE)==DEAL_TYPE_BUY ? "BUY" : "SELL")+",";
      json+="\"direction\":"+KMFXQuote(entry_info.found ? entry_info.direction : "")+",";
      json+="\"volume\":"+KMFXDoubleJson(HistoryDealGetDouble(ticket,DEAL_VOLUME),2)+",";
      json+="\"price\":"+KMFXDoubleJson(HistoryDealGetDouble(ticket,DEAL_PRICE),_Digits)+",";
      json+="\"open_price\":"+(entry_info.found ? KMFXDoubleJson(entry_info.open_price,_Digits) : "0")+",";
      json+="\"open_time\":"+(entry_info.found ? KMFXQuote(entry_info.open_time) : KMFXQuote(""))+",";
      json+="\"open_time_unix\":"+(entry_info.found ? IntegerToString(entry_info.open_time_unix) : "0")+",";
      json+="\"sl\":"+(entry_info.found ? KMFXDoubleJson(entry_info.sl,_Digits) : "0")+",";
      json+="\"tp\":"+(entry_info.found ? KMFXDoubleJson(entry_info.tp,_Digits) : "0")+",";
      json+="\"profit\":"+KMFXDoubleJson(trade_profit,2)+",";
      json+="\"commission\":"+KMFXDoubleJson(total_commission,2)+",";
      json+="\"close_commission\":"+KMFXDoubleJson(close_commission,2)+",";
      json+="\"entry_commission\":"+KMFXDoubleJson(entry_commission,2)+",";
      json+="\"swap\":"+KMFXDoubleJson(total_swap,2)+",";
      json+="\"close_swap\":"+KMFXDoubleJson(close_swap,2)+",";
      json+="\"entry_swap\":"+KMFXDoubleJson(entry_swap,2)+",";
      json+="\"net\":"+KMFXDoubleJson(trade_net,2)+",";
      json+="\"comment\":"+KMFXQuote(cleaned_comment)+",";
      json+="\"strategy_tag\":"+KMFXQuote(cleaned_comment)+",";
      json+="\"time\":"+KMFXQuote(TimeToString((datetime)HistoryDealGetInteger(ticket,DEAL_TIME),TIME_DATE|TIME_SECONDS))+",";
      json+="\"time_unix\":"+IntegerToString((long)HistoryDealGetInteger(ticket,DEAL_TIME));
      json+="}";
     }

   json+="]";
   return json;
  }

string KMFXBuildSyncTradesJson(int max_count)
  {
   datetime to_time=KMFXNow();
   datetime from_time=KMFXHistoryFromTime();
   if(!HistorySelect(from_time,to_time))
      return "[]";

   string json="[";
   bool first=true;
   int total=HistoryDealsTotal();
   int added=0;
   KMFXEntryDealInfo entry_map[];
   string position_ids[];
   int entry_map_size=0;
   KMFXBuildEntryMap(from_time,to_time,entry_map,position_ids,entry_map_size);

   for(int i=total-1;i>=0;i--)
     {
      if(max_count>0 && added>=max_count)
         break;

      ulong ticket=HistoryDealGetTicket(i);
      if(ticket==0)
         continue;

      long entry=HistoryDealGetInteger(ticket,DEAL_ENTRY);
      if(entry!=DEAL_ENTRY_OUT)
         continue;

      if(!first)
         json+=",";
      first=false;
      added++;

      long position_id_long=HistoryDealGetInteger(ticket,DEAL_POSITION_ID);
      string position_id=IntegerToString(position_id_long);
      KMFXEntryDealInfo entry_info;
      KMFXFindEntryDeal(position_id,entry_map,position_ids,entry_map_size,entry_info);
      string cleaned_comment=KMFXCleanComment(HistoryDealGetString(ticket,DEAL_COMMENT));
      if(StringLen(cleaned_comment)==0 && entry_info.found)
         cleaned_comment=KMFXCleanComment(entry_info.comment);
      double close_commission=HistoryDealGetDouble(ticket,DEAL_COMMISSION);
      double close_swap=HistoryDealGetDouble(ticket,DEAL_SWAP);
      double close_volume=HistoryDealGetDouble(ticket,DEAL_VOLUME);
      double entry_ratio=KMFXEntryCostShareRatio(entry_info,close_volume);
      double entry_commission=entry_info.found ? entry_info.commission*entry_ratio : 0.0;
      double entry_swap=entry_info.found ? entry_info.swap*entry_ratio : 0.0;
      if(!MathIsValidNumber(close_commission))
         close_commission=0.0;
      if(!MathIsValidNumber(close_swap))
         close_swap=0.0;
      if(!MathIsValidNumber(entry_commission))
         entry_commission=0.0;
      if(!MathIsValidNumber(entry_swap))
         entry_swap=0.0;
      double total_commission=close_commission+entry_commission;
      double total_swap=close_swap+entry_swap;
      double trade_profit=HistoryDealGetDouble(ticket,DEAL_PROFIT);
      if(!MathIsValidNumber(trade_profit))
         trade_profit=0.0;
      double trade_net=trade_profit+total_commission+total_swap;
      if(!MathIsValidNumber(trade_net))
         trade_net=0.0;

      json+="{";
      json+="\"trade_id\":"+KMFXQuote((string)ticket)+",";
      json+="\"ticket\":"+IntegerToString((int)ticket)+",";
      json+="\"position_id\":"+position_id+",";
      json+="\"symbol\":"+KMFXQuote(HistoryDealGetString(ticket,DEAL_SYMBOL))+",";
      json+="\"type\":"+KMFXQuote(HistoryDealGetInteger(ticket,DEAL_TYPE)==DEAL_TYPE_BUY ? "BUY" : "SELL")+",";
      json+="\"direction\":"+KMFXQuote(entry_info.found ? entry_info.direction : "")+",";
      json+="\"volume\":"+KMFXDoubleJson(HistoryDealGetDouble(ticket,DEAL_VOLUME),2)+",";
      json+="\"price\":"+KMFXDoubleJson(HistoryDealGetDouble(ticket,DEAL_PRICE),_Digits)+",";
      json+="\"open_price\":"+(entry_info.found ? KMFXDoubleJson(entry_info.open_price,_Digits) : "0")+",";
      json+="\"open_time\":"+(entry_info.found ? KMFXQuote(entry_info.open_time) : KMFXQuote(""))+",";
      json+="\"open_time_unix\":"+(entry_info.found ? IntegerToString(entry_info.open_time_unix) : "0")+",";
      json+="\"sl\":"+(entry_info.found ? KMFXDoubleJson(entry_info.sl,_Digits) : "0")+",";
      json+="\"tp\":"+(entry_info.found ? KMFXDoubleJson(entry_info.tp,_Digits) : "0")+",";
      json+="\"profit\":"+KMFXDoubleJson(trade_profit,2)+",";
      json+="\"commission\":"+KMFXDoubleJson(total_commission,2)+",";
      json+="\"close_commission\":"+KMFXDoubleJson(close_commission,2)+",";
      json+="\"entry_commission\":"+KMFXDoubleJson(entry_commission,2)+",";
      json+="\"swap\":"+KMFXDoubleJson(total_swap,2)+",";
      json+="\"close_swap\":"+KMFXDoubleJson(close_swap,2)+",";
      json+="\"entry_swap\":"+KMFXDoubleJson(entry_swap,2)+",";
      json+="\"net\":"+KMFXDoubleJson(trade_net,2)+",";
      json+="\"comment\":"+KMFXQuote(cleaned_comment)+",";
      json+="\"strategy_tag\":"+KMFXQuote(cleaned_comment)+",";
      json+="\"time\":"+KMFXQuote(TimeToString((datetime)HistoryDealGetInteger(ticket,DEAL_TIME),TIME_DATE|TIME_SECONDS))+",";
      json+="\"time_unix\":"+IntegerToString((long)HistoryDealGetInteger(ticket,DEAL_TIME));
      json+="}";
     }

   json+="]";
   return json;
  }

string KMFXBuildSyncHistoryJson(int max_points)
  {
   datetime to_time=KMFXNow();
   datetime from_time=KMFXHistoryFromTime();
   if(!HistorySelect(from_time,to_time))
     {
      string fallback_json="[";
      fallback_json+="{\"label\":\"balance\",\"timestamp\":"+KMFXQuote(KMFXNowIso())+",\"value\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_BALANCE),2)+"},";
      fallback_json+="{\"label\":\"equity\",\"timestamp\":"+KMFXQuote(KMFXNowIso())+",\"value\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_EQUITY),2)+"}";
      fallback_json+="]";
      return fallback_json;
     }

   int total=HistoryDealsTotal();
   double pnls[];
   datetime times[];
   int collected=0;

   for(int i=total-1;i>=0;i--)
     {
      if(max_points>0 && collected>=max_points)
         break;

      ulong ticket=HistoryDealGetTicket(i);
      if(ticket==0)
         continue;

      if(HistoryDealGetInteger(ticket,DEAL_ENTRY)!=DEAL_ENTRY_OUT)
         continue;

      ArrayResize(pnls,collected+1);
      ArrayResize(times,collected+1);
      pnls[collected]=HistoryDealGetDouble(ticket,DEAL_PROFIT)+HistoryDealGetDouble(ticket,DEAL_COMMISSION)+HistoryDealGetDouble(ticket,DEAL_SWAP);
      times[collected]=(datetime)HistoryDealGetInteger(ticket,DEAL_TIME);
      collected++;
     }

   if(collected<=0)
     {
      string minimal_json="[";
      minimal_json+="{\"label\":\"balance\",\"timestamp\":"+KMFXQuote(KMFXNowIso())+",\"value\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_BALANCE),2)+"},";
      minimal_json+="{\"label\":\"equity\",\"timestamp\":"+KMFXQuote(KMFXNowIso())+",\"value\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_EQUITY),2)+"}";
      minimal_json+="]";
      return minimal_json;
     }

   double running_balance=AccountInfoDouble(ACCOUNT_BALANCE);
   for(int j=0;j<collected;j++)
      running_balance-=pnls[j];

   string json="[";
   for(int k=collected-1;k>=0;k--)
     {
      running_balance+=pnls[k];
      if(k!=collected-1)
         json+=",";
      json+="{";
      json+="\"label\":"+KMFXQuote(TimeToString(times[k],TIME_DATE|TIME_MINUTES))+",";
      json+="\"timestamp\":"+KMFXQuote(TimeToString(times[k],TIME_DATE|TIME_SECONDS))+",";
      json+="\"value\":"+KMFXDoubleJson(running_balance,2);
      json+="}";
     }
   json+=",";
   json+="{";
   json+="\"label\":\"equity\",";
   json+="\"timestamp\":"+KMFXQuote(KMFXNowIso())+",";
   json+="\"value\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_EQUITY),2);
   json+="}";
   json+="]";
   return json;
  }

string KMFXBuildSyncPayload(string sync_id)
  {
   datetime now_time=KMFXNow();
   string sync_login=KMFXAccountLoginString();
   string positions_json=KMFXBuildPositionsJson();
   string trades_json=KMFXBuildSyncTradesJson(KMFXClosedDealsLimit);
   string symbol_specs_json=KMFXBuildSymbolSpecsJson();
   int history_points_limit=0;
   if(KMFXHistoryPointsLimit>0 && KMFXClosedDealsLimit>0)
      history_points_limit=MathMin(KMFXHistoryPointsLimit,KMFXClosedDealsLimit);
   else
     if(KMFXHistoryPointsLimit>0)
        history_points_limit=KMFXHistoryPointsLimit;
     else
        history_points_limit=KMFXClosedDealsLimit;
   string history_json=KMFXBuildSyncHistoryJson(history_points_limit);
   datetime rm_to=now_time;
   datetime rm_from=KMFXHistoryFromTime();
   string report_metrics_json=KMFXBuildReportMetrics(rm_from,rm_to);
   double daily_dd_pct=KMFXDailyDrawdownPct();
   double total_dd_pct=KMFXTotalDrawdownPct();
   if(KMFXVerboseLog)
      PrintFormat("[KMFX][DEBUG] login usado en sync payload=%s", sync_login);
   string json="{";
   json+="\"type\":\"kmfx_connector_sync\",";
   json+="\"connector_version\":"+KMFXQuote(KMFX_CONNECTOR_VERSION)+",";
   json+="\"mode\":"+KMFXQuote(KMFXModeName())+",";
   json+="\"sync_id\":"+KMFXQuote(sync_id)+",";
   json+="\"connection_key\":"+KMFXQuote(KMFXConnectionKeyValue())+",";
   json += "\"login\":" + sync_login + ",";
   json+="\"timestamp\":"+KMFXQuote(TimeToString(now_time,TIME_DATE|TIME_SECONDS))+",";
   json+="\"timestamp_unix\":"+IntegerToString((long)now_time)+",";
   json+="\"floating_pnl\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_PROFIT),2)+",";
   json+="\"daily_dd_pct\":"+KMFXDoubleJson(daily_dd_pct,4)+",";
   json+="\"total_dd_pct\":"+KMFXDoubleJson(total_dd_pct,4)+",";
   json+="\"equity_peak\":"+KMFXDoubleJson(Runtime.equity_peak,2)+",";
   json+="\"daily_start_equity\":"+KMFXDoubleJson(Runtime.daily_start_equity,2)+",";
   json+="\"daily_start_day_key\":"+KMFXQuote(KMFXDayKey(KMFXNow()))+",";
   json+="\"daily_peak_equity\":"+KMFXDoubleJson(Runtime.daily_peak_equity,2)+",";
   json+="\"account\":"+KMFXBuildAccountJson()+",";
   json+="\"symbolSpecs\":"+symbol_specs_json+",";
   json+="\"positions\":"+positions_json+",";
   json+="\"trades\":"+trades_json+",";
   json+="\"history\":"+history_json+",";
   json+="\"reportMetrics\":"+report_metrics_json;
   json+="}";
   return json;
  }

string KMFXBuildJournalBatchPayload(string batch_id,string trades_json)
  {
   string login_value=KMFXAccountLoginString();
   string json="{";
   json+="\"type\":\"kmfx_connector_journal\",";
   json+="\"connector_version\":"+KMFXQuote(KMFX_CONNECTOR_VERSION)+",";
   json+="\"mode\":"+KMFXQuote(KMFXModeName())+",";
   json+="\"batch_id\":"+KMFXQuote(batch_id)+",";
   json+="\"connection_key\":"+KMFXQuote(KMFXConnectionKeyValue())+",";
   json+="\"login\":"+login_value+",";
   json+="\"timestamp\":"+KMFXQuote(KMFXNowIso())+",";
   json+="\"trades\":"+trades_json;
   json+="}";
   return json;
  }

int KMFXCountJsonArrayItems(string json,string key)
  {
   string array_json="";
   if(!KMFXExtractJsonArrayRaw(json,key,array_json))
      return 0;

   string trimmed=KMFXTrim(array_json);
   if(trimmed=="[]" || StringLen(trimmed)<2)
      return 0;

   int count=0;
   int depth=0;
   bool in_string=false;

   for(int i=0;i<StringLen(trimmed);i++)
     {
      ushort ch=(ushort)StringGetCharacter(trimmed,i);
      if(ch=='\"')
        {
         bool escaped=(i>0 && StringGetCharacter(trimmed,i-1)=='\\');
         if(!escaped)
            in_string=!in_string;
         continue;
        }
      if(in_string)
         continue;
      if(ch=='{')
        {
         if(depth==0)
            count++;
         depth++;
         continue;
        }
      if(ch=='}' && depth>0)
         depth--;
     }

   return count;
  }

// -------------------------------------------------------------------
// HTTP / JSON
// -------------------------------------------------------------------
bool KMFXSendHttpRequest(string method,string url,string body,string &response,int &status_code,int &transport_error)
  {
   char req[];
   char res[];
   string headers="Content-Type: application/json\r\nConnection: close\r\n";
   string result_headers="";
   int request_bytes=0;

   if(StringLen(KMFXApiKey)>0)
      headers+="X-KMFX-API-Key: "+KMFXApiKey+"\r\n";
   if(KMFXHasConnectionKey())
      headers+="X-KMFX-Connection-Key: "+KMFXConnectionKeyValue()+"\r\n";

   if(method=="POST")
     {
      StringToCharArray(body,req,0,StringLen(body));
      request_bytes=ArraySize(req);
     }

   ResetLastError();
   status_code=WebRequest(method,url,headers,KMFXWebTimeoutMs,req,res,result_headers);
   int request_error=GetLastError();
   transport_error=request_error;
   if(KMFXVerboseLog)
      PrintFormat("[KMFX][HTTP][RAW] method=%s url=%s timeout_ms=%d request_bytes=%d status=%d last_error=%d", method, url, KMFXWebTimeoutMs, request_bytes, status_code, request_error);
   if(status_code==1003 || status_code<=0)
     {
      PrintFormat("[KMFX][HTTP][TRANSPORT] method=%s url=%s request_bytes=%d last_error=%d", method, url, request_bytes, request_error);
     }
   if(status_code==-1)
     {
      response="";
      Policy.backend_connected=false;
      Policy.degraded_mode=true;
      KMFXSetError("WebRequest falló. code="+IntegerToString(request_error)+" url="+url);
      return false;
     }

   response=CharArrayToString(res,0,-1,CP_UTF8);
   if(KMFXVerboseLog)
     {
      PrintFormat("[KMFX][HTTP] method=%s url=%s status=%d body=%s", method, url, status_code, response);
      PrintFormat("[KMFX][HTTP][META] method=%s url=%s response_bytes=%d response_chars=%d headers=%s", method, url, ArraySize(res), StringLen(response), result_headers);
     }
   return true;
  }

bool KMFXExtractJsonString(string json,string key,string &value)
  {
   string needle="\""+key+"\":";
   int start=StringFind(json,needle);
   if(start<0)
      return false;

   start+=StringLen(needle);
   while(start<StringLen(json) && (StringGetCharacter(json,start)==' ' || StringGetCharacter(json,start)=='\"'))
      start++;

   int end=start;
   while(end<StringLen(json))
     {
      ushort ch=(ushort)StringGetCharacter(json,end);
      if(ch=='\"' || ch==',' || ch=='}' || ch==']')
         break;
      end++;
     }

   value=KMFXTrim(StringSubstr(json,start,end-start));
   return true;
  }

bool KMFXExtractJsonBool(string json,string key,bool &value)
  {
   string raw="";
   if(!KMFXExtractJsonString(json,key,raw))
      return false;
   string normalized=raw;
   StringToLower(normalized);
   value=(normalized=="true");
   return true;
  }

bool KMFXExtractJsonDouble(string json,string key,double &value)
  {
   string raw="";
   if(!KMFXExtractJsonString(json,key,raw))
      return false;
   value=StringToDouble(raw);
   if(!MathIsValidNumber(value))
      value=0.0;
   return true;
  }

bool KMFXExtractJsonArrayRaw(string json,string key,string &value)
  {
   string needle="\""+key+"\":";
   int start=StringFind(json,needle);
   if(start<0)
      return false;

   start+=StringLen(needle);
   int bracket=StringFind(json,"[",start);
   if(bracket<0)
      return false;

   int depth=0;
   for(int i=bracket;i<StringLen(json);i++)
     {
      ushort ch=(ushort)StringGetCharacter(json,i);
      if(ch=='[')
         depth++;
      if(ch==']')
        {
         depth--;
         if(depth==0)
           {
            value=StringSubstr(json,bracket,i-bracket+1);
            return true;
           }
        }
     }
   return false;
  }

string KMFXExtractSyncDisposition(string json)
  {
   string disposition="";
   if(KMFXExtractJsonString(json,"disposition",disposition))
      return disposition;
   return "";
  }

bool KMFXHandlePendingSyncFailure(string file_name,KMFXPendingSync &item,int status_code,int transport_error)
  {
   item.attempts++;
   if(item.attempts>KMFXPendingSyncMaxAttempts())
     {
      KMFXDeletePendingSyncFile(file_name);
      PrintFormat("[KMFX][SYNC][DROPPED] sync_id=%s reason=transport_exhausted attempts=%d status=%d last_error=%d", item.sync_id, item.attempts, status_code, transport_error);
      return false;
     }

   item.next_retry_at=KMFXNow()+(datetime)KMFXPendingSyncBackoffSeconds(item.attempts);
   KMFXSavePendingSync(item);
   PrintFormat("[KMFX][SYNC][QUEUED] sync_id=%s attempts=%d next_retry=%s", item.sync_id, item.attempts, TimeToString(item.next_retry_at,TIME_DATE|TIME_SECONDS));
   return false;
  }

void KMFXProcessPendingSyncQueue()
  {
   string file_name="";
   long handle=FileFindFirst(KMFXPendingSyncPrefix()+"*.txt",file_name,FILE_COMMON);
   if(handle==INVALID_HANDLE)
      return;

   datetime now_time=KMFXNow();
   bool processed=false;

   do
     {
      KMFXPendingSync item;
      if(!KMFXLoadPendingSync(file_name,item))
         continue;
      if(item.next_retry_at>now_time)
         continue;

      string response="";
      int status_code=0;
      int transport_error=0;
      bool request_ok=false;
      string disposition="";

      PrintFormat("[KMFX][SYNC][RETRYING] sync_id=%s attempt=%d", item.sync_id, item.attempts+1);
      request_ok=KMFXSendHttpRequest("POST",KMFXBackendBaseUrl+KMFXSyncPath,item.payload,response,status_code,transport_error);

      if(!request_ok && !(status_code==1003 || status_code<=0))
        {
         processed=true;
         break;
        }

      if(status_code==1003 || status_code<=0)
        {
         Policy.backend_connected=false;
         Policy.degraded_mode=true;
         KMFXHandlePendingSyncFailure(file_name,item,status_code,transport_error);
         processed=true;
         break;
        }

      if(status_code>=300)
        {
         KMFXDeletePendingSyncFile(file_name);
         PrintFormat("[KMFX][SYNC][BACKEND_REJECT] sync_id=%s status=%d", item.sync_id, status_code);
         processed=true;
         break;
        }

      disposition=KMFXExtractSyncDisposition(response);
      if(disposition=="duplicate")
         PrintFormat("[KMFX][SYNC][DUPLICATE_ACK] sync_id=%s", item.sync_id);
      else
         PrintFormat("[KMFX][SYNC][RECOVERED] retry=%d recovered=true final_status=%d sync_id=%s", item.attempts, status_code, item.sync_id);

      KMFXDeletePendingSyncFile(file_name);
      Policy.backend_connected=true;
      Policy.degraded_mode=false;
      Runtime.last_error="";
      processed=true;
      break;
     }
   while(FileFindNext(handle,file_name));

   FileFindClose(handle);
   if(processed)
      Runtime.last_state_push_at=KMFXNow();
  }

bool KMFXExtractAllowedValues(string array_json,string &csv)
  {
   csv="";
   int len=StringLen(array_json);
   string current="";
   bool in_string=false;

   for(int i=0;i<len;i++)
     {
      ushort ch=(ushort)StringGetCharacter(array_json,i);
      if(ch=='\"')
        {
         in_string=!in_string;
         if(!in_string && StringLen(current)>0)
           {
            if(StringLen(csv)>0)
               csv+=",";
            csv+=current;
            current="";
           }
         continue;
        }
      if(in_string)
         current+=CharToString((uchar)ch);
     }
   return true;
  }

void KMFXApplyDefaultPolicyIfMissing()
  {
   if(StringLen(Policy.enforcement_mode)==0)
      Policy.enforcement_mode=KMFXModeName();
   if(StringLen(Policy.severity)==0)
      Policy.severity="info";
   if(StringLen(Policy.reason_code)==0)
      Policy.reason_code="OK";
   if(!MathIsValidNumber(Policy.max_risk_per_trade_pct))
      Policy.max_risk_per_trade_pct=0.0;
   if(!MathIsValidNumber(Policy.max_volume))
      Policy.max_volume=0.0;
   if(!MathIsValidNumber(Policy.daily_dd_hard_stop))
      Policy.daily_dd_hard_stop=0.0;
   if(!MathIsValidNumber(Policy.total_dd_hard_stop))
      Policy.total_dd_hard_stop=0.0;
   if(!MathIsValidNumber(Policy.equity_protection_limit))
      Policy.equity_protection_limit=0.0;
  }

bool KMFXPushState()
  {
   string response="";
   int status_code=0;
   int transport_error=0;
   bool recovered_after_retry=false;
   bool request_ok=false;
   string sync_id=KMFXBuildSyncId();
   string disposition="";
   string url=KMFXBackendBaseUrl+KMFXSyncPath;
   string body=KMFXBuildSyncPayload(sync_id);
   int positions_count=KMFXCountJsonArrayItems(body,"positions");
   int trades_count=KMFXCountJsonArrayItems(body,"trades");
   int history_count=KMFXCountJsonArrayItems(body,"history");

   PrintFormat("[KMFX][SYNC][COUNTS] positions=%d trades=%d history=%d", positions_count, trades_count, history_count);
   if(KMFXVerboseLog)
     {
      PrintFormat("[KMFX][SYNC][REQUEST] url=%s body_chars=%d", url, StringLen(body));
      PrintFormat("[KMFX][SYNC][KEY] connection_key=%s", KMFXConnectionKeyValue());
      Print("[KMFX][PAYLOAD] "+body);
      PrintFormat("[KMFX][SYNC][REQUEST][BODY]=%s", body);
     }

   request_ok=KMFXSendHttpRequest("POST",url,body,response,status_code,transport_error);
   if(!request_ok && !(status_code==1003 || status_code<=0))
      return false;

   if(KMFXVerboseLog)
      PrintFormat("[KMFX][SYNC][DEBUG] status_code=%d response=%s", status_code, response);

   if(status_code==1003 || status_code<=0)
     {
      PrintFormat("[KMFX][SYNC][RETRY] retry=1 reason=transport_error status=%d last_error=%d", status_code, transport_error);
      Sleep(250);
      response="";
      status_code=0;
      transport_error=0;

      request_ok=KMFXSendHttpRequest("POST",url,body,response,status_code,transport_error);
      if(!request_ok && !(status_code==1003 || status_code<=0))
         return false;

      if(KMFXVerboseLog)
         PrintFormat("[KMFX][SYNC][DEBUG] status_code=%d response=%s", status_code, response);

      if(status_code==1003 || status_code<=0)
        {
         Policy.backend_connected=false;
         Policy.degraded_mode=true;
         KMFXQueuePendingSync(sync_id,body,2);
         KMFXSetError("Sync falló en transporte MT5. HTTP="+IntegerToString(status_code)+" last_error="+IntegerToString(transport_error));
         return false;
        }

      if(status_code>=200 && status_code<300)
        {
         recovered_after_retry=true;
         Policy.backend_connected=true;
         Policy.degraded_mode=false;
         PrintFormat("[KMFX][SYNC][RECOVERED] retry=1 recovered=true final_status=%d", status_code);
        }
    }

   if(status_code>=300)
     {
      Policy.backend_connected=false;
      Policy.degraded_mode=true;
      KMFXSetError("Sync rechazado por backend. HTTP="+IntegerToString(status_code));
     return false;
    }

   disposition=KMFXExtractSyncDisposition(response);
   if(disposition=="duplicate")
      PrintFormat("[KMFX][SYNC][DUPLICATE_ACK] sync_id=%s", sync_id);

   Policy.backend_connected=true;
   if(!recovered_after_retry)
      Policy.degraded_mode=false;
   Runtime.last_error="";
   Runtime.last_state_push_at=KMFXNow();
   KMFXLog("SYNC","Estado enviado al backend.");
   return true;
  }

bool KMFXSendJournalBatch(string batch_id,string trade_ids_csv,string payload,string source_label)
  {
   string response="";
   int status_code=0;
   int transport_error=0;
   bool request_ok=false;
   string disposition="";

   request_ok=KMFXSendHttpRequest("POST",KMFXBackendBaseUrl+KMFXJournalPath,payload,response,status_code,transport_error);
   if(!request_ok && !(status_code==1003 || status_code<=0))
      return false;

   if(status_code==1003 || status_code<=0)
     {
      PrintFormat("[KMFX][JOURNAL][RETRY] source=%s retry=1 reason=transport_error status=%d last_error=%d batch_id=%s", source_label, status_code, transport_error, batch_id);
      Sleep(250);
      response="";
      status_code=0;
      transport_error=0;
      request_ok=KMFXSendHttpRequest("POST",KMFXBackendBaseUrl+KMFXJournalPath,payload,response,status_code,transport_error);
      if(!request_ok && !(status_code==1003 || status_code<=0))
         return false;

      if(status_code==1003 || status_code<=0)
        {
         KMFXPendingJournalBatch item;
         item.batch_id=batch_id;
         item.trade_ids_csv=trade_ids_csv;
         item.payload=payload;
         item.attempts=2;
         item.created_at=KMFXNow();
         item.next_retry_at=KMFXNow()+(datetime)KMFXPendingSyncBackoffSeconds(item.attempts);
         KMFXSavePendingJournalBatch(item);
         PrintFormat("[KMFX][JOURNAL][QUEUED] batch_id=%s attempts=%d", batch_id, item.attempts);
         return false;
        }
     }

   if(status_code>=300)
     {
      PrintFormat("[KMFX][JOURNAL][BACKEND_REJECT] batch_id=%s status=%d", batch_id, status_code);
      return false;
     }

   disposition=KMFXExtractSyncDisposition(response);
   if(disposition=="duplicate")
      PrintFormat("[KMFX][JOURNAL][DUPLICATE] batch_id=%s", batch_id);
   else
      PrintFormat("[KMFX][JOURNAL][ACCEPTED] batch_id=%s", batch_id);

   KMFXMarkTradeCsvAsSent(trade_ids_csv);
   return true;
  }

void KMFXProcessPendingJournalQueue()
  {
   string file_name="";
   long handle=FileFindFirst(KMFXPendingJournalPrefix()+"*.txt",file_name,FILE_COMMON);
   if(handle==INVALID_HANDLE)
      return;

   datetime now_time=KMFXNow();
   do
     {
      KMFXPendingJournalBatch item;
      if(!KMFXLoadPendingJournalBatch(file_name,item))
         continue;
      if(item.next_retry_at>now_time)
         continue;

      string response="";
      int status_code=0;
      int transport_error=0;
      bool request_ok=false;
      string disposition="";

      PrintFormat("[KMFX][JOURNAL][RETRYING] batch_id=%s attempt=%d", item.batch_id, item.attempts+1);
      request_ok=KMFXSendHttpRequest("POST",KMFXBackendBaseUrl+KMFXJournalPath,item.payload,response,status_code,transport_error);
      if(!request_ok && !(status_code==1003 || status_code<=0))
         break;

      if(status_code==1003 || status_code<=0)
        {
         item.attempts++;
         if(item.attempts>KMFXPendingSyncMaxAttempts())
           {
            KMFXDeletePendingJournalFile(file_name);
            PrintFormat("[KMFX][JOURNAL][DROPPED] batch_id=%s reason=transport_exhausted attempts=%d", item.batch_id, item.attempts);
           }
         else
           {
            item.next_retry_at=KMFXNow()+(datetime)KMFXPendingSyncBackoffSeconds(item.attempts);
            KMFXSavePendingJournalBatch(item);
            PrintFormat("[KMFX][JOURNAL][QUEUED] batch_id=%s attempts=%d next_retry=%s", item.batch_id, item.attempts, TimeToString(item.next_retry_at,TIME_DATE|TIME_SECONDS));
           }
         break;
        }

      if(status_code>=300)
        {
         KMFXDeletePendingJournalFile(file_name);
         PrintFormat("[KMFX][JOURNAL][BACKEND_REJECT] batch_id=%s status=%d", item.batch_id, status_code);
         break;
        }

      disposition=KMFXExtractSyncDisposition(response);
      if(disposition=="duplicate")
         PrintFormat("[KMFX][JOURNAL][DUPLICATE] batch_id=%s", item.batch_id);
      else
         PrintFormat("[KMFX][JOURNAL][RECOVERED] batch_id=%s final_status=%d", item.batch_id, status_code);
      KMFXMarkTradeCsvAsSent(item.trade_ids_csv);
      KMFXDeletePendingJournalFile(file_name);
      break;
     }
   while(FileFindNext(handle,file_name));

   FileFindClose(handle);
  }

void KMFXPushJournalBatch()
  {
   string trade_ids_csv="";
   string trades_json=KMFXBuildJournalTradesJson(KMFXJournalBatchSize,trade_ids_csv);
   if(StringLen(trade_ids_csv)==0)
      return;

   string batch_id=KMFXBuildJournalBatchId();
   string payload=KMFXBuildJournalBatchPayload(batch_id,trades_json);
   KMFXSendJournalBatch(batch_id,trade_ids_csv,payload,"live");
  }

bool KMFXFetchPolicy()
  {
   string response="";
   int status_code=0;
   int transport_error=0;
   string policy_login=KMFXAccountLoginString();
   if(KMFXVerboseLog)
      PrintFormat("[KMFX][DEBUG] login usado en policy=%s", policy_login);
   string url = KMFXBackendBaseUrl + KMFXPolicyPath + "?login=" + policy_login;
   if(KMFXHasConnectionKey())
      url += "&connection_key=" + KMFXConnectionKeyValue();

   if(KMFXVerboseLog)
      PrintFormat("[KMFX][POLICY][REQUEST] url=%s", url);

   if(!KMFXSendHttpRequest("GET",url,"",response,status_code,transport_error))
      return false;

   if(KMFXVerboseLog)
      PrintFormat("[KMFX][POLICY][DEBUG] status_code=%d response=%s", status_code, response);

   if(status_code==1003 || status_code<=0)
     {
      PrintFormat("[KMFX][POLICY][TRANSPORT] status=%d last_error=%d url=%s", status_code, transport_error, url);
     }

   if(status_code<200 || status_code>=300)
     {
      Policy.backend_connected=false;
      Policy.degraded_mode=true;
      KMFXSetError("Policy fetch rechazada por backend. HTTP="+IntegerToString(status_code));
      return false;
     }

   KMFXPolicyCache next_policy=Policy;
   string raw_sessions="";
   string raw_symbols="";
   string previous_hash=Policy.policy_hash;
   string panic_expires_raw="";

   KMFXExtractJsonString(response,"risk_status",next_policy.risk_status);
   KMFXExtractJsonString(response,"blocking_rule",next_policy.blocking_rule);
   KMFXExtractJsonString(response,"action_required",next_policy.action_required);
   KMFXExtractJsonString(response,"enforcement_mode",next_policy.enforcement_mode);
   KMFXExtractJsonString(response,"current_level",next_policy.current_level);
   KMFXExtractJsonString(response,"recommended_level",next_policy.recommended_level);
   KMFXExtractJsonString(response,"reason_code",next_policy.reason_code);
   KMFXExtractJsonString(response,"severity",next_policy.severity);
   KMFXExtractJsonString(response,"policy_hash",next_policy.policy_hash);

   KMFXExtractJsonBool(response,"panic_lock_active",next_policy.panic_lock_active);
   KMFXExtractJsonBool(response,"close_all_required",next_policy.close_all_required);
   KMFXExtractJsonBool(response,"auto_block",next_policy.auto_block);
   KMFXExtractJsonBool(response,"volatility_override_active",next_policy.volatility_override_active);

   KMFXExtractJsonDouble(response,"max_risk_per_trade_pct",next_policy.max_risk_per_trade_pct);
   KMFXExtractJsonDouble(response,"max_volume",next_policy.max_volume);
   KMFXExtractJsonDouble(response,"daily_dd_hard_stop",next_policy.daily_dd_hard_stop);
   KMFXExtractJsonDouble(response,"total_dd_hard_stop",next_policy.total_dd_hard_stop);
   KMFXExtractJsonDouble(response,"equity_protection_limit",next_policy.equity_protection_limit);

   double backend_equity_peak=0.0;
   double backend_daily_start=0.0;
   string backend_day_key="";
   KMFXExtractJsonDouble(response,"equity_peak",backend_equity_peak);
   KMFXExtractJsonDouble(response,"daily_start_equity",backend_daily_start);
   KMFXExtractJsonString(response,"daily_start_day_key",backend_day_key);

   if(KMFXExtractJsonString(response,"panic_lock_expires_at",panic_expires_raw))
      next_policy.panic_lock_expires_at=KMFXParseIsoUtc(panic_expires_raw);

   if(KMFXExtractJsonArrayRaw(response,"allowed_sessions",raw_sessions))
      KMFXExtractAllowedValues(raw_sessions,next_policy.allowed_sessions_csv);

   if(KMFXExtractJsonArrayRaw(response,"allowed_symbols",raw_symbols))
      KMFXExtractAllowedValues(raw_symbols,next_policy.allowed_symbols_csv);

   if(MathIsValidNumber(backend_equity_peak) && backend_equity_peak>0.0)
     {
      double resolved_peak=MathMax(Runtime.equity_peak,backend_equity_peak);
      if(resolved_peak!=Runtime.equity_peak)
        {
         PrintFormat("[KMFX][POLICY][PEAK_SYNC] local=%.2f backend=%.2f resolved=%.2f",
                     Runtime.equity_peak,backend_equity_peak,resolved_peak);
         Runtime.equity_peak=resolved_peak;
        }
     }

   string local_day_key=KMFXDayKey(KMFXNow());
   if(MathIsValidNumber(backend_daily_start)
      && backend_daily_start>0.0
      && StringLen(backend_day_key)>0
      && backend_day_key==local_day_key)
     {
      Runtime.daily_start_equity=backend_daily_start;
      PrintFormat("[KMFX][POLICY][DAILY_START_SYNC] restored=%.2f day=%s",
                  backend_daily_start,backend_day_key);
     }
   else if(StringLen(backend_day_key)>0 && backend_day_key!=local_day_key)
     {
      PrintFormat("[KMFX][POLICY][DAILY_START_SKIP] backend_day=%s local_day=%s reason=day_mismatch",
                  backend_day_key,local_day_key);
     }

   next_policy.loaded=true;
   next_policy.backend_connected=true;
   next_policy.degraded_mode=false;
   next_policy.last_sync_at=KMFXNow();
   next_policy.last_good_sync_at=KMFXNow();
   KMFXApplyDefaultPolicyIfMissing();
   Policy=next_policy;
   Runtime.last_policy_poll_at=KMFXNow();
   Runtime.last_error="";

   if(previous_hash!=Policy.policy_hash && StringLen(Policy.policy_hash)>0)
      KMFXLog("POLICY","Nueva policy_hash aplicada: "+Policy.policy_hash,true);

   KMFXLog("POLICY","Política de riesgo actualizada desde backend.");
   return true;
  }

// -------------------------------------------------------------------
// Enforcement preventivo
// -------------------------------------------------------------------
KMFXValidationResult KMFXAllowResult()
  {
   KMFXValidationResult result;
   result.allowed=true;
   result.reason_code="ALLOWED";
   result.message="Operación permitida";
   result.suggested_action="Continuar";
   return result;
  }

KMFXValidationResult KMFXDenyResult(string reason_code,string message,string suggested_action)
  {
   KMFXValidationResult result;
   result.allowed=false;
   result.reason_code=reason_code;
   result.message=message;
   result.suggested_action=suggested_action;
   return result;
  }

bool KMFXIsPolicyCritical()
  {
   return KMFXParseSeverity(Policy.severity)>=KMFX_SEVERITY_CRITICAL;
  }

double KMFXEffectiveTradeRiskLimit()
  {
   return Policy.max_risk_per_trade_pct;
  }

KMFXValidationResult KMFXCanOpenTradeInternal(KMFXOrderIntent &intent)
  {
   if(!Policy.loaded)
      return KMFXAllowResult();

   if(Policy.panic_lock_active)
      return KMFXDenyResult("PANIC_LOCK_ACTIVE","Panic lock activo.","Espera a que expire o desactívalo desde backend.");

   if(Runtime.trading_frozen)
      return KMFXDenyResult("TRADING_FROZEN",Runtime.freeze_reason,"No abras nuevas órdenes hasta resolver el hard stop.");

   if(Policy.auto_block && KMFXIsPolicyCritical())
      return KMFXDenyResult(
         StringLen(Policy.reason_code)>0 ? Policy.reason_code : "BACKEND_DENY",
         StringLen(Policy.blocking_rule)>0 ? Policy.blocking_rule : "Backend en estado crítico.",
         StringLen(Policy.action_required)>0 ? Policy.action_required : "Revisa el estado de riesgo antes de seguir."
      );

   if(StringLen(Policy.allowed_symbols_csv)>0 && !KMFXSplitCsvContains(Policy.allowed_symbols_csv,intent.symbol))
      return KMFXDenyResult("SYMBOL_NOT_ALLOWED","Símbolo no permitido por política.","Opera solo dentro de la whitelist.");

   if(!KMFXIsSessionAllowed())
      return KMFXDenyResult("SESSION_NOT_ALLOWED","La sesión actual no está permitida.","Espera la ventana operativa autorizada.");

   if(Policy.max_volume>0.0 && intent.volume>Policy.max_volume)
      return KMFXDenyResult("MAX_VOLUME_BREACH","El volumen supera el máximo permitido.","Reduce lotaje antes de enviar.");

   double effective_risk=intent.risk_pct;
   if(effective_risk<=0.0)
      effective_risk=KMFXEstimateRiskPct(intent.symbol,intent.side,intent.volume,intent.entry_price,intent.stop_loss);

   double allowed_risk=KMFXEffectiveTradeRiskLimit();
   if(allowed_risk>0.0 && effective_risk>allowed_risk)
      return KMFXDenyResult("TRADE_RISK_ABOVE_LIMIT","El riesgo por trade supera el máximo permitido.","Reduce tamaño o ajusta SL.");

   if(Policy.auto_block && StringLen(Policy.blocking_rule)>0)
     {
      string blocking_rule_lower=Policy.blocking_rule;
      StringToLower(blocking_rule_lower);
      if(StringFind(blocking_rule_lower,"stop")>=0)
         return KMFXDenyResult(
            StringLen(Policy.reason_code)>0 ? Policy.reason_code : "BACKEND_BLOCKING_RULE",
            Policy.blocking_rule,
            StringLen(Policy.action_required)>0 ? Policy.action_required : "Sigue la instrucción del backend."
         );
     }

   return KMFXAllowResult();
  }

bool KMFXCanOpenTrade(string symbol,string side,double volume,double entry_price,double stop_loss,double take_profit,double risk_pct,double risk_amount,string strategy_tag="")
  {
   KMFXOrderIntent intent;
   intent.symbol=symbol;
   intent.side=side;
   intent.volume=volume;
   intent.entry_price=entry_price;
   intent.stop_loss=stop_loss;
   intent.take_profit=take_profit;
   intent.risk_pct=risk_pct;
   intent.risk_amount=risk_amount;
   intent.strategy_tag=strategy_tag;

   KMFXValidationResult validation=KMFXCanOpenTradeInternal(intent);
   if(!validation.allowed)
      KMFXLog("BLOCK",validation.reason_code+" | "+validation.message+" | "+validation.suggested_action,true);
   return validation.allowed;
  }

// -------------------------------------------------------------------
// Enforcement reactivo
// -------------------------------------------------------------------
void KMFXFreezeTrading(string reason)
  {
   Runtime.trading_frozen=true;
   Runtime.freeze_reason=reason;
   KMFXLog("FREEZE",reason,true);
  }

bool KMFXClosePositionByTicket(ulong position_ticket)
  {
   if(!PositionSelectByTicket(position_ticket))
      return false;

   bool ok=Trade.PositionClose(position_ticket);
   if(!ok)
      KMFXSetError("No se pudo cerrar posición "+(string)position_ticket+" retcode="+IntegerToString((int)Trade.ResultRetcode()));
   return ok;
  }

bool KMFXDeleteOrderByTicket(ulong order_ticket)
  {
   bool ok=Trade.OrderDelete(order_ticket);
   if(!ok)
      KMFXSetError("No se pudo cancelar orden "+(string)order_ticket+" retcode="+IntegerToString((int)Trade.ResultRetcode()));
   return ok;
  }

void KMFXCloseAllPositions()
  {
   if(Runtime.close_all_in_progress)
      return;

   datetime now_time=KMFXNow();
   if((now_time-Runtime.last_close_all_at)<5)
      return;

   Runtime.close_all_in_progress=true;
   Runtime.last_close_all_at=now_time;

   KMFXLog("ENFORCE","Iniciando cierre total de posiciones y cancelación de pendientes.",true);

   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong position_ticket=PositionGetTicket(i);
      if(position_ticket>0)
         KMFXClosePositionByTicket(position_ticket);
     }

   for(int j=OrdersTotal()-1;j>=0;j--)
     {
      ulong order_ticket=OrderGetTicket(j);
      if(order_ticket>0)
         KMFXDeleteOrderByTicket(order_ticket);
     }

   Runtime.close_all_in_progress=false;
  }

bool KMFXShouldForceCloseNow()
  {
   if(Policy.close_all_required)
      return true;

   if(Policy.panic_lock_active && KMFXIsPolicyCritical())
      return true;

   return false;
  }

void KMFXCheckHardStops()
  {
   if(!KMFXEnableEnforce || !Policy.loaded)
      return;

   Runtime.last_hard_stop_check_at=KMFXNow();
   KMFXResetDailyContextIfNeeded();

   double current_equity=AccountInfoDouble(ACCOUNT_EQUITY);
   double daily_dd_pct=KMFXDailyDrawdownPct();
   double total_dd_pct=KMFXTotalDrawdownPct();

   bool daily_dd_breach=(Policy.daily_dd_hard_stop>0.0 && daily_dd_pct>=Policy.daily_dd_hard_stop);
   bool total_dd_breach=(Policy.total_dd_hard_stop>0.0 && total_dd_pct>=Policy.total_dd_hard_stop);
   bool equity_breach=(Policy.equity_protection_limit>0.0 && current_equity<=Policy.equity_protection_limit);
   bool critical_panic=(Policy.panic_lock_active && Policy.close_all_required);

   if(!(daily_dd_breach || total_dd_breach || equity_breach || critical_panic))
      return;

   string reason="";
   if(daily_dd_breach)
      reason="Daily DD hard stop alcanzado.";
   else if(total_dd_breach)
      reason="Total DD hard stop alcanzado.";
   else if(equity_breach)
      reason="Equity protection limit alcanzado.";
   else if(critical_panic)
      reason="Panic lock crítico con close_all_required.";

   Runtime.hard_stop_triggered=true;
   KMFXFreezeTrading(reason);

   bool should_close=false;
   if(KMFXMode==PROTECT_MODE)
      should_close=true;
   else if(KMFXMode==SAFE_MODE && KMFXShouldForceCloseNow())
      should_close=true;

   if(should_close)
      KMFXCloseAllPositions();
  }

void KMFXEnforceTradeTransaction(const MqlTradeTransaction &trans)
  {
   if(!KMFXEnableEnforce || !Policy.loaded || !Policy.auto_block)
      return;

   if(trans.type!=TRADE_TRANSACTION_DEAL_ADD && trans.type!=TRADE_TRANSACTION_ORDER_ADD)
      return;

   string symbol=trans.symbol;
   if(StringLen(symbol)==0)
      return;

   KMFXOrderIntent intent;
   intent.symbol=symbol;
   intent.side=KMFXSideFromOrderType((ENUM_ORDER_TYPE)trans.order_type);
   intent.volume=trans.volume;
   intent.entry_price=trans.price;
   intent.stop_loss=trans.price_sl;
   intent.take_profit=trans.price_tp;
   intent.risk_pct=KMFXEstimateRiskPct(intent.symbol,intent.side,intent.volume,intent.entry_price,intent.stop_loss);
   intent.risk_amount=KMFXEstimateRiskAmount(intent.symbol,intent.side,intent.volume,intent.entry_price,intent.stop_loss);
   intent.strategy_tag="";

   KMFXValidationResult validation=KMFXCanOpenTradeInternal(intent);
   if(validation.allowed)
      return;

   KMFXLog("AUDIT","Bloqueo reactivo: "+validation.reason_code+" | "+validation.message,true);

   if(trans.type==TRADE_TRANSACTION_ORDER_ADD && trans.order>0)
      KMFXDeleteOrderByTicket(trans.order);

   if(KMFXMode==PROTECT_MODE && trans.position>0)
      KMFXClosePositionByTicket(trans.position);
  }

// -------------------------------------------------------------------
// Runtime / polling
// -------------------------------------------------------------------
bool KMFXShouldPushState()
  {
   return (KMFXNow()-Runtime.last_state_push_at)>=KMFXStatePushSeconds;
  }

bool KMFXShouldRefreshPolicy()
  {
   if(!Policy.loaded)
      return true;
   return (KMFXNow()-Runtime.last_policy_poll_at)>=KMFXPolicyPollSeconds;
  }

void KMFXRunCycle()
  {
   KMFXRefreshRuntimeConnectionKey();
   KMFXResetDailyContextIfNeeded();
   KMFXProcessPendingSyncQueue();
   KMFXProcessPendingJournalQueue();

   if(KMFXShouldPushState())
      KMFXPushState();

   KMFXPushJournalBatch();

   if(KMFXShouldRefreshPolicy())
      KMFXFetchPolicy();

   KMFXCheckHardStops();
  }

// -------------------------------------------------------------------
// Event handlers
// -------------------------------------------------------------------
int OnInit()
  {
   ZeroMemory(Policy);
   ZeroMemory(Runtime);

   Runtime.initialized=true;
   Runtime.daily_start_equity=AccountInfoDouble(ACCOUNT_EQUITY);
   Runtime.daily_peak_equity=Runtime.daily_start_equity;
   Runtime.equity_peak=Runtime.daily_start_equity;
   PrintFormat("[KMFX][INIT][PEAK_BOOTSTRAP] initial_peak=%.2f (will sync from backend)",
               Runtime.equity_peak);
   Runtime.current_day_key=KMFXDayKey(KMFXNow());
   PrintFormat("[KMFX][VERSION] connector=%s", KMFX_CONNECTOR_VERSION);
   KMFXInitializeRuntimeConnectionKey();

   if(KMFXVerboseLog)
     {
      PrintFormat("[KMFX][BUILD] DEBUG_HTTP_V2 timeout_ms=%d backend=%s sync=%s policy=%s", KMFXWebTimeoutMs, KMFXBackendBaseUrl, KMFXSyncPath, KMFXPolicyPath);
      PrintFormat("[KMFX][DEBUG] OnInit ACCOUNT_LOGIN=%I64d", (long)AccountInfoInteger(ACCOUNT_LOGIN));
     }
   KMFXLog("INIT","KMFX Connector v"+KMFX_CONNECTOR_VERSION+" iniciado. Mode="+KMFXModeName()+" Backend="+KMFXBackendBaseUrl,true);
   EventSetMillisecondTimer(KMFXTimerMs);
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   KMFXLog("DEINIT","Connector detenido. reason="+IntegerToString(reason),true);
  }

void OnTimer()
  {
   KMFXRunCycle();
  }

void OnTick()
  {
   // Intencionalmente ligero.
   // El núcleo operativo vive en OnTimer para no depender del flujo de ticks
   // de un solo símbolo y mantener polling estable hacia backend/policy.
  }

void OnTradeTransaction(const MqlTradeTransaction &trans,const MqlTradeRequest &request,const MqlTradeResult &result)
  {
   KMFXEnforceTradeTransaction(trans);
  }
//+------------------------------------------------------------------+
