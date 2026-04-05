//+------------------------------------------------------------------+
//| KMFXConnector v2.0                                               |
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
#property version   "2.00"
#property strict

#include <Trade/Trade.mqh>

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
input string            KMFXBackendBaseUrl    = "http://127.0.0.1:8000";
input string            KMFXSyncPath          = "/api/mt5/sync";
input string            KMFXJournalPath       = "/api/mt5/journal";
input string            KMFXPolicyPath        = "/api/mt5/policy";
input string            KMFXApiKey            = "";
input string            connection_key        = "";
input int               KMFXTimerMs           = 2000;
input int               KMFXPolicyPollSeconds = 12;
input int               KMFXStatePushSeconds  = 5;
input int               KMFXWebTimeoutMs      = 5000;
input int               KMFXClosedDealsLimit  = 50;
input int               KMFXJournalBatchSize  = 20;
input bool              KMFXVerboseLog        = true;
input bool              KMFXEnableEnforce     = true;
input bool              KMFXSendClosedDeals   = true;
input bool              KMFXUseBrokerTime     = true;

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
   PrintFormat("[KMFX][DEBUG] ACCOUNT_LOGIN raw=%I64d helper=%s", login, helper_login);
   return helper_login;
  }

string KMFXBuildSyncId()
  {
   string identity=StringLen(KMFXTrim(connection_key))>0 ? KMFXTrim(connection_key) : KMFXAccountLoginString();
   return identity+"-"+IntegerToString((int)KMFXNow())+"-"+IntegerToString((int)GetTickCount());
  }

string KMFXConnectionKeyValue()
  {
   return KMFXTrim(connection_key);
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
      json+="\"risk_amount\":"+KMFXDoubleJson(risk_amount,2)+",";
      json+="\"risk_pct\":"+KMFXDoubleJson(risk_pct,4)+",";
      json+="\"strategy_tag\":"+KMFXQuote(PositionGetString(POSITION_COMMENT))+",";
      json+="\"time\":"+KMFXQuote(TimeToString((datetime)PositionGetInteger(POSITION_TIME),TIME_DATE|TIME_SECONDS));
      json+="}";
     }

   json+="]";
   return json;
  }

string KMFXBuildJournalTradesJson(int max_count,string &trade_ids_csv)
  {
   trade_ids_csv="";
   if(!KMFXSendClosedDeals || max_count<=0)
      return "[]";

   datetime to_time=KMFXNow();
   datetime from_time=to_time-(datetime)(86400*7);
   if(!HistorySelect(from_time,to_time))
      return "[]";

   string json="[";
   bool first=true;
   int total=HistoryDealsTotal();
   int added=0;

   for(int i=total-1;i>=0;i--)
     {
      if(added>=KMFXClosedDealsLimit)
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

      json+="{";
      json+="\"trade_id\":"+KMFXQuote(trade_id)+",";
      json+="\"ticket\":"+IntegerToString((int)ticket)+",";
      json+="\"position_id\":"+IntegerToString((int)HistoryDealGetInteger(ticket,DEAL_POSITION_ID))+",";
      json+="\"symbol\":"+KMFXQuote(HistoryDealGetString(ticket,DEAL_SYMBOL))+",";
      json+="\"type\":"+KMFXQuote(HistoryDealGetInteger(ticket,DEAL_TYPE)==DEAL_TYPE_BUY ? "BUY" : "SELL")+",";
      json+="\"volume\":"+KMFXDoubleJson(HistoryDealGetDouble(ticket,DEAL_VOLUME),2)+",";
      json+="\"price\":"+KMFXDoubleJson(HistoryDealGetDouble(ticket,DEAL_PRICE),_Digits)+",";
      json+="\"profit\":"+KMFXDoubleJson(HistoryDealGetDouble(ticket,DEAL_PROFIT),2)+",";
      json+="\"commission\":"+KMFXDoubleJson(HistoryDealGetDouble(ticket,DEAL_COMMISSION),2)+",";
      json+="\"swap\":"+KMFXDoubleJson(HistoryDealGetDouble(ticket,DEAL_SWAP),2)+",";
      json+="\"comment\":"+KMFXQuote(HistoryDealGetString(ticket,DEAL_COMMENT))+",";
      json+="\"time\":"+KMFXQuote(TimeToString((datetime)HistoryDealGetInteger(ticket,DEAL_TIME),TIME_DATE|TIME_SECONDS));
      json+="}";
     }

   json+="]";
   return json;
  }

string KMFXBuildSyncPayload(string sync_id)
  {
   string sync_login=KMFXAccountLoginString();
   PrintFormat("[KMFX][DEBUG] login usado en sync payload=%s", sync_login);
   string json="{";
   json+="\"type\":\"kmfx_connector_sync\",";
   json+="\"connector_version\":\"2.00\",";
   json+="\"mode\":"+KMFXQuote(KMFXModeName())+",";
   json+="\"sync_id\":"+KMFXQuote(sync_id)+",";
    json+="\"connection_key\":"+KMFXQuote(KMFXConnectionKeyValue())+",";
   json += "\"login\":" + sync_login + ",";
   json+="\"timestamp\":"+KMFXQuote(KMFXNowIso())+",";
   json+="\"floating_pnl\":"+KMFXDoubleJson(AccountInfoDouble(ACCOUNT_PROFIT),2)+",";
   json+="\"account\":"+KMFXBuildAccountJson()+",";
   json+="\"positions\":"+KMFXBuildPositionsJson()+",";
   json+="\"trades\":[]";
   json+="}";
   return json;
  }

string KMFXBuildJournalBatchPayload(string batch_id,string trades_json)
  {
   string login_value=KMFXAccountLoginString();
   string json="{";
   json+="\"type\":\"kmfx_connector_journal\",";
   json+="\"connector_version\":\"2.00\",";
   json+="\"mode\":"+KMFXQuote(KMFXModeName())+",";
   json+="\"batch_id\":"+KMFXQuote(batch_id)+",";
   json+="\"connection_key\":"+KMFXQuote(KMFXConnectionKeyValue())+",";
   json+="\"login\":"+login_value+",";
   json+="\"timestamp\":"+KMFXQuote(KMFXNowIso())+",";
   json+="\"trades\":"+trades_json;
   json+="}";
   return json;
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
   // DEBUG
   PrintFormat("[KMFX][HTTP][RAW] method=%s url=%s timeout_ms=%d request_bytes=%d status=%d last_error=%d", method, url, KMFXWebTimeoutMs, request_bytes, status_code, request_error);
   if(status_code==1003 || status_code<=0)
     {
      // DEBUG
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
   // DEBUG
   PrintFormat("[KMFX][HTTP] method=%s url=%s status=%d body=%s", method, url, status_code, response);
   // DEBUG
   PrintFormat("[KMFX][HTTP][META] method=%s url=%s response_bytes=%d response_chars=%d headers=%s", method, url, ArraySize(res), StringLen(response), result_headers);
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

   // DEBUG
   PrintFormat("[KMFX][SYNC][REQUEST] url=%s body_chars=%d", url, StringLen(body));
   // DEBUG
   PrintFormat("[KMFX][SYNC][REQUEST][BODY]=%s", body);

   request_ok=KMFXSendHttpRequest("POST",url,body,response,status_code,transport_error);
   if(!request_ok && !(status_code==1003 || status_code<=0))
      return false;

   // DEBUG
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

      // DEBUG
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
   PrintFormat("[KMFX][DEBUG] login usado en policy=%s", policy_login);
   string url = KMFXBackendBaseUrl + KMFXPolicyPath + "?login=" + policy_login;
   if(KMFXHasConnectionKey())
      url += "&connection_key=" + KMFXConnectionKeyValue();

   // DEBUG
   PrintFormat("[KMFX][POLICY][REQUEST] url=%s", url);

   if(!KMFXSendHttpRequest("GET",url,"",response,status_code,transport_error))
      return false;

   // DEBUG
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

   if(KMFXExtractJsonString(response,"panic_lock_expires_at",panic_expires_raw))
      next_policy.panic_lock_expires_at=KMFXParseIsoUtc(panic_expires_raw);

   if(KMFXExtractJsonArrayRaw(response,"allowed_sessions",raw_sessions))
      KMFXExtractAllowedValues(raw_sessions,next_policy.allowed_sessions_csv);

   if(KMFXExtractJsonArrayRaw(response,"allowed_symbols",raw_symbols))
      KMFXExtractAllowedValues(raw_symbols,next_policy.allowed_symbols_csv);

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
   Runtime.current_day_key=KMFXDayKey(KMFXNow());

   // DEBUG
   PrintFormat("[KMFX][BUILD] DEBUG_HTTP_V2 timeout_ms=%d backend=%s sync=%s policy=%s", KMFXWebTimeoutMs, KMFXBackendBaseUrl, KMFXSyncPath, KMFXPolicyPath);
   PrintFormat("[KMFX][DEBUG] OnInit ACCOUNT_LOGIN=%I64d", (long)AccountInfoInteger(ACCOUNT_LOGIN));
   KMFXLog("INIT","KMFX Connector v2 iniciado. Mode="+KMFXModeName()+" Backend="+KMFXBackendBaseUrl,true);
   EventSetMillisecondTimer(KMFXTimerMs);
   KMFXRunCycle();
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
