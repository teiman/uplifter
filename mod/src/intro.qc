// intro.qc — Día 1 news-broadcast intro.
//
// MVP version: durante 10 s el heli del jugador queda congelado y se
// muestra texto BREAKING NEWS (centerprint + banner CSQC). La cámara
// permanece en la del piloto (no movemos a tercera persona en esta
// iteración — ver TODO al final).
//
// Mecánica:
//   - Al iniciar, freezamos el heli del jugador (MOVETYPE_NONE).
//   - Bloqueamos botones de input cada PreThink.
//   - Llenamos STAT_HUD_INTRO con la fase actual (1 = heli, 2 =
//     davenport) para que el HUD pinte el banner.
//   - Al terminar, restauramos.
//
// TODO: cinemática real con SVC_INTERMISSION + info_intermission
//       calculada sobre el heli y centroide de Davenport.

// Tiempo por fase y total. 10 s por fase da margen sobrado para leer el
// headline + la sub-línea narrada y respirar un poco antes del cambio.
float INTRO_PHASE_DUR = 10;
float INTRO_TOTAL_DUR = 20;

float g_intro_running;
float g_intro_start_time;
float g_intro_phase;

.float intro_saved_movetype;
.entity intro_saved_heli;

// Empieza la intro. Llamada cuando hay al menos 1 player conectado y es
// día 1.
void() Intro_Begin =
{
	local entity p;
	local entity heli;
	local entity prev_self;

	if (g_intro_running)
	{
		return;
	}
	g_intro_running = 1;
	g_intro_start_time = time;
	g_intro_phase = 1;

	prev_self = self;
	p = find(world, classname, "player");
	while (p)
	{
		self = p;
		heli = self.enemy;
		self.intro_saved_heli = heli;
		if ((heli != world))
		{
			self.intro_saved_movetype = heli.movetype;
			heli.movetype = MOVETYPE_NONE;
			heli.velocity = '0 0 0';
		}
		centerprint(self, "BREAKING NEWS\n\nDAVENPORT UNDER SIEGE\nGoliath forces have surrounded the coastal city after the recent oil discovery.");
		p = find(p, classname, "player");
	}
	self = prev_self;
	bprint("> CNN-7 NEWSDESK ON AIR\n");
};

void() Intro_End =
{
	local entity p;
	local entity prev_self;
	local entity heli;

	if (!g_intro_running)
	{
		return;
	}
	g_intro_running = 0;
	g_intro_phase = 0;

	prev_self = self;
	p = find(world, classname, "player");
	while (p)
	{
		self = p;
		heli = self.intro_saved_heli;
		if ((heli != world))
		{
			heli.movetype = self.intro_saved_movetype;
			if ((heli.movetype == 0))
			{
				heli.movetype = MOVETYPE_FLY;
			}
		}
		centerprint(self, "");
		self.hud_intro = 0;
		p = find(p, classname, "player");
	}
	self = prev_self;
	bprint("> CNN-7 returns to scheduled programming.\n");
};

// Llamado por PlayerPreThink mientras g_intro_running. Bloquea input
// y publica la fase actual al CSQC HUD via .hud_intro.
// Asume self == player.
void() Intro_TickPlayer =
{
	self.impulse = 0;
	self.button0 = 0;
	self.button1 = 0;
	self.button2 = 0;
	self.hud_intro = g_intro_phase;
};

// Tick global llamado desde StartFrame.
void() Intro_Tick =
{
	local float elapsed;
	local float new_phase;

	if (!g_intro_running)
	{
		return;
	}
	elapsed = (time - g_intro_start_time);
	if ((elapsed >= INTRO_TOTAL_DUR))
	{
		Intro_End();
		return;
	}
	if ((elapsed < INTRO_PHASE_DUR))
	{
		new_phase = 1;
	}
	else
	{
		new_phase = 2;
	}
	if ((new_phase != g_intro_phase))
	{
		g_intro_phase = new_phase;
		// Cambio de fase: actualizar el centerprint.
		local entity p;
		local entity prev_self;
		prev_self = self;
		p = find(world, classname, "player");
		while (p)
		{
			self = p;
			if ((new_phase == 2))
			{
				centerprint(self, "BREAKING NEWS\n\nWOUNDED REPORTED IN THE STREETS\nA humanitarian rescue helicopter has been dispatched to the area.");
			}
			p = find(p, classname, "player");
		}
		self = prev_self;
	}
};
