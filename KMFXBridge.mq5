//+------------------------------------------------------------------+
//|  KMFXBridge v3.4 — KMFX Edge Bridge EA                         |
//|  Solo lectura — no modifica ordenes ni posiciones               |
//+------------------------------------------------------------------+
#property copyright "KMFX Edge"
#property version   "3.40"
#property strict

input string BridgeURL    = "http://192.168.1.227:8766/mt5data";
input int    UpdateMs     = 2000;
input bool   SendHistory  = true;
input int    HistoryDays  = 365;
input bool   VerboseLog   = false;
input int    TimeoutMs    = 1500;

int OnInit()
{
   Print("KMFX Bridge v3.4 iniciado. URL: ", BridgeURL);
   EventSetMillisecondTimer(UpdateMs);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer() { SendData(); }
void OnTick()  {}

void SendData()
{
   string post = BuildJSON(SendHistory);
   char body[], res[];
   string rh = "";
   StringToCharArray(post, body, 0, StringLen(post));
   int r = WebRequest("POST", BridgeURL, "Content-Type: application/json", TimeoutMs, body, res, rh);
   if(r == -1 && VerboseLog)
      Print("KMFX err=", GetLastError());
   else if(VerboseLog)
      Print("KMFX OK ", StringLen(post), "b");
}

string Q(string s)             { return "\"" + s + "\""; }
string KV(string k, string v)  { return "\"" + k + "\":\"" + v + "\""; }
string KVn(string k, string v) { return "\"" + k + "\":" + v; }

bool SymbolListContains(string &symbols[], int count, string symbol)
{
   for(int i = 0; i < count; i++)
      if(symbols[i] == symbol) return true;
   return false;
}

void AddSymbolCandidate(string symbol, string &symbols[], int &count, int max_count)
{
   if(StringLen(symbol) == 0 || count >= max_count) return;
   if(SymbolListContains(symbols, count, symbol)) return;
   if(!SymbolInfoInteger(symbol, SYMBOL_SELECT)) return;
   ArrayResize(symbols, count + 1);
   symbols[count] = symbol;
   count++;
}

string SymbolSpecJSON(string symbol)
{
   if(StringLen(symbol) == 0 || !SymbolInfoInteger(symbol, SYMBOL_SELECT))
      return "";

   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   double tick_size = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   double tick_value = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
   double tick_value_profit = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE_PROFIT);
   double tick_value_loss = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
   double contract_size = SymbolInfoDouble(symbol, SYMBOL_TRADE_CONTRACT_SIZE);
   double volume_min = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double volume_max = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double volume_step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   if(point <= 0) return "";
   if(tick_size <= 0) tick_size = point;

   string j = "{";
   j += KV("symbol", symbol) + ",";
   j += KVn("digits", IntegerToString((int)SymbolInfoInteger(symbol, SYMBOL_DIGITS))) + ",";
   j += KVn("point", DoubleToString(point, 8)) + ",";
   j += KVn("tickSize", DoubleToString(tick_size, 8)) + ",";
   j += KVn("tickValue", DoubleToString(tick_value, 8)) + ",";
   j += KVn("tickValueProfit", DoubleToString(tick_value_profit, 8)) + ",";
   j += KVn("tickValueLoss", DoubleToString(tick_value_loss, 8)) + ",";
   j += KVn("contractSize", DoubleToString(contract_size, 8)) + ",";
   j += KVn("volumeMin", DoubleToString(volume_min, 8)) + ",";
   j += KVn("volumeMax", DoubleToString(volume_max, 8)) + ",";
   j += KVn("volumeStep", DoubleToString(volume_step, 8)) + ",";
   j += KV("currencyProfit", SymbolInfoString(symbol, SYMBOL_CURRENCY_PROFIT)) + ",";
   j += KV("currencyMargin", SymbolInfoString(symbol, SYMBOL_CURRENCY_MARGIN)) + ",";
   j += KVn("tradeCalcMode", IntegerToString((int)SymbolInfoInteger(symbol, SYMBOL_TRADE_CALC_MODE))) + ",";
   j += KVn("spread", IntegerToString((int)SymbolInfoInteger(symbol, SYMBOL_SPREAD))) + ",";
   j += KV("accountCurrency", AccountInfoString(ACCOUNT_CURRENCY));
   j += "}";
   return j;
}

string SymbolSpecsJSON()
{
   const int max_symbols = 32;
   string symbols[];
   int count = 0;

   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      AddSymbolCandidate(PositionGetString(POSITION_SYMBOL), symbols, count, max_symbols);
   }

   string common[] = {"EURUSD","GBPUSD","USDJPY","XAUUSD","NAS100","US100","US30","US500","SPX500"};
   for(int i = 0; i < ArraySize(common) && count < max_symbols; i++)
      AddSymbolCandidate(common[i], symbols, count, max_symbols);

   string j = "{";
   bool first = true;
   for(int i = 0; i < count; i++)
   {
      string spec = SymbolSpecJSON(symbols[i]);
      if(StringLen(spec) == 0) continue;
      if(!first) j += ",";
      first = false;
      j += Q(symbols[i]) + ":" + spec;
   }
   j += "}";
   return j;
}

string BuildJSON(bool hist)
{
   string j = "{";
   j += KV("timestamp", TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)) + ",";
   j += KV("type", "mt5_update") + ",";
   j += KV("mode", "live") + ",";

   // Account
   j += "\"account\":{";
   j += KVn("login",       IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))) + ",";
   j += KV("broker",       AccountInfoString(ACCOUNT_COMPANY)) + ",";
   j += KV("server",       AccountInfoString(ACCOUNT_SERVER)) + ",";
   j += KV("currency",     AccountInfoString(ACCOUNT_CURRENCY)) + ",";
   j += KVn("balance",     DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2)) + ",";
   j += KVn("equity",      DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2)) + ",";
   j += KVn("margin",      DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 2)) + ",";
   j += KVn("free_margin", DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2)) + ",";
   j += KVn("profit",      DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT), 2)) + ",";
   j += KVn("leverage",    IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE))) + ",";

   // Deposito inicial
   double initialDeposit = 0;
   if(HistorySelect(0, TimeCurrent()))
   {
      int nd = HistoryDealsTotal();
      for(int di = 0; di < nd; di++)
      {
         ulong dk = HistoryDealGetTicket(di);
         if(dk == 0) continue;
         if((ENUM_DEAL_TYPE)HistoryDealGetInteger(dk, DEAL_TYPE) == DEAL_TYPE_BALANCE)
            initialDeposit += HistoryDealGetDouble(dk, DEAL_PROFIT);
      }
   }
   j += KVn("initial_deposit", DoubleToString(initialDeposit, 2));
   j += "},";
   j += "\"symbolSpecs\":" + SymbolSpecsJSON() + ",";

   // Posiciones
   j += "\"positions\":[";
   int tot = PositionsTotal();
   for(int i = 0; i < tot; i++)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(i > 0) j += ",";
      string ptype = PositionGetInteger(POSITION_TYPE) == 0 ? "BUY" : "SELL";
      j += "{";
      j += KVn("ticket",     IntegerToString(t)) + ",";
      j += KV("symbol",      PositionGetString(POSITION_SYMBOL)) + ",";
      j += KV("type",        ptype) + ",";
      j += KVn("volume",     DoubleToString(PositionGetDouble(POSITION_VOLUME), 2)) + ",";
      j += KVn("open_price", DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), 5)) + ",";
      j += KVn("current",    DoubleToString(PositionGetDouble(POSITION_PRICE_CURRENT), 5)) + ",";
      j += KVn("sl",         DoubleToString(PositionGetDouble(POSITION_SL), 5)) + ",";
      j += KVn("tp",         DoubleToString(PositionGetDouble(POSITION_TP), 5)) + ",";
      j += KVn("profit",     DoubleToString(PositionGetDouble(POSITION_PROFIT), 2)) + ",";
      j += KVn("swap",       DoubleToString(PositionGetDouble(POSITION_SWAP), 2)) + ",";
      j += KVn("open_time",  IntegerToString(PositionGetInteger(POSITION_TIME)));
      j += "}";
   }
   j += "],";

   // Trades: agrupar por position_id para obtener P&L neto completo
   // Incluye comision de apertura (DEAL_ENTRY_IN) + cierre (DEAL_ENTRY_OUT)
   j += "\"trades\":[";
   if(hist)
   {
      datetime from = TimeCurrent() - (datetime)(HistoryDays * 86400);

      if(HistorySelect(from, TimeCurrent()))
      {
         int total = HistoryDealsTotal();

         // Agrupar deals por position_id
         // Cada posicion tiene: 1 DEAL_ENTRY_IN + 1 DEAL_ENTRY_OUT (mínimo)
         // Necesitamos: comm_total = comm_in + comm_out, gross = DEAL_PROFIT del OUT
         struct PositionData
         {
            ulong  pos_id;
            string symbol;
            string deal_type;
            double volume;
            double open_price;
            double close_price;
            double gross_profit;   // DEAL_PROFIT del deal de cierre
            double comm_total;     // comm_in + comm_out
            double swap;
            long   open_time;
            long   close_time;
            bool   has_out;
         };

         // Usar arrays para almacenar datos por position_id
         ulong  pos_ids[];
         double pos_gross[];
         double pos_comm[];
         double pos_swap[];
         double pos_vol[];
         double pos_open[];
         double pos_close[];
         long   pos_open_time[];
         long   pos_close_time[];
         string pos_symbol[];
         string pos_type[];
         bool   pos_has_out[];
         int    pos_count = 0;

         // Primera pasada: recoger datos de todos los deals relevantes
         for(int i = 0; i < total; i++)
         {
            ulong ticket = HistoryDealGetTicket(i);
            if(ticket == 0) continue;

            long dtime = (long)HistoryDealGetInteger(ticket, DEAL_TIME);
            if(dtime < (long)from) continue;

            int entry = (int)HistoryDealGetInteger(ticket, DEAL_ENTRY);
            // Solo procesar IN y OUT (ignorar IN_OUT y otros)
            if(entry != DEAL_ENTRY_IN && entry != DEAL_ENTRY_OUT) continue;

            ulong pos_id = (ulong)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
            double comm  = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
            double gross = HistoryDealGetDouble(ticket, DEAL_PROFIT);
            double sw    = HistoryDealGetDouble(ticket, DEAL_SWAP);

            // Buscar si ya existe este position_id
            int idx = -1;
            for(int k = 0; k < pos_count; k++)
               if(pos_ids[k] == pos_id) { idx = k; break; }

            if(idx == -1)
            {
               // Nuevo position_id
               ArrayResize(pos_ids,       pos_count+1);
               ArrayResize(pos_gross,     pos_count+1);
               ArrayResize(pos_comm,      pos_count+1);
               ArrayResize(pos_swap,      pos_count+1);
               ArrayResize(pos_vol,       pos_count+1);
               ArrayResize(pos_open,      pos_count+1);
               ArrayResize(pos_close,     pos_count+1);
               ArrayResize(pos_open_time, pos_count+1);
               ArrayResize(pos_close_time,pos_count+1);
               ArrayResize(pos_symbol,    pos_count+1);
               ArrayResize(pos_type,      pos_count+1);
               ArrayResize(pos_has_out,   pos_count+1);
               idx = pos_count;
               pos_ids[idx]        = pos_id;
               pos_gross[idx]      = 0;
               pos_comm[idx]       = 0;
               pos_swap[idx]       = 0;
               pos_vol[idx]        = 0;
               pos_open[idx]       = 0;
               pos_close[idx]      = 0;
               pos_open_time[idx]  = 0;
               pos_close_time[idx] = 0;
               pos_symbol[idx]     = HistoryDealGetString(ticket, DEAL_SYMBOL);
               pos_type[idx]       = HistoryDealGetInteger(ticket, DEAL_TYPE) == DEAL_TYPE_BUY ? "BUY" : "SELL";
               pos_has_out[idx]    = false;
               pos_count++;
            }

            // Acumular datos
            pos_comm[idx] += comm;
            pos_swap[idx] += sw;

            if(entry == DEAL_ENTRY_IN)
            {
               pos_vol[idx]       = HistoryDealGetDouble(ticket, DEAL_VOLUME);
               pos_open[idx]      = HistoryDealGetDouble(ticket, DEAL_PRICE);
               pos_open_time[idx] = dtime;
            }
            else if(entry == DEAL_ENTRY_OUT)
            {
               pos_gross[idx]      += gross;  // puede haber cierres parciales
               pos_close[idx]       = HistoryDealGetDouble(ticket, DEAL_PRICE);
               pos_close_time[idx]  = dtime;
               pos_has_out[idx]     = true;
               if(pos_vol[idx] == 0)
                  pos_vol[idx] = HistoryDealGetDouble(ticket, DEAL_VOLUME);
            }
         }

         // Segunda pasada: emitir posiciones cerradas en el periodo
         int added = 0;
         for(int i = 0; i < pos_count; i++)
         {
            if(!pos_has_out[i]) continue;
            if(pos_close_time[i] <= 0) continue;
            if(pos_close_time[i] < (long)from) continue;

            double net = pos_gross[i] + pos_comm[i] + pos_swap[i];

            if(added > 0) j += ",";
            j += "{";
            j += KVn("ticket",       IntegerToString(pos_ids[i])) + ",";
            j += KV("symbol",        pos_symbol[i]) + ",";
            j += KV("type",          pos_type[i]) + ",";
            j += KVn("volume",       DoubleToString(pos_vol[i], 2)) + ",";
            j += KVn("open_price",   DoubleToString(pos_open[i], 5)) + ",";
            j += KVn("close_price",  DoubleToString(pos_close[i], 5)) + ",";
            j += KVn("profit",       DoubleToString(net, 2)) + ",";
            j += KVn("gross_profit", DoubleToString(pos_gross[i], 2)) + ",";
            j += KVn("commission",   DoubleToString(pos_comm[i], 2)) + ",";
            j += KVn("swap",         DoubleToString(pos_swap[i], 2)) + ",";
            j += KVn("open_time",    IntegerToString(pos_open_time[i])) + ",";
            j += KVn("close_time",   IntegerToString(pos_close_time[i])) + ",";
            j += KV("status",        "CLOSED");
            j += "}";
            added++;
         }
      }
   }
   j += "]}";
   return j;
}
//+------------------------------------------------------------------+
