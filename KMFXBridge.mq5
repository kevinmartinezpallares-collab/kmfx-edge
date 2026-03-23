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