// day.qc — Day cycle and wave system.
//
// Each session runs through 5 days. A day ends when the player has either
// rescued or lost every civilian in the current wave. End of day triggers
// the next day's newscast + upgrade package choice (upgrades.qc).
//
// Day 5 swaps the regular wave for a single representative pickup; landing
// at the carrier closes the game.
//
// Difficulty escalation is driven by `g_day` and consumed by:
//   - info_enemy_slot entities (activate by day threshold)
//   - objectives.qc (number of concurrent pickups)
//   - hospital.qc (hospital destruction chance)

float DAY_MAX = 5;

// Global: current day (1..5). Day 0 = pre-game (engine boot).
float g_day;
// Civilians remaining in the current wave. When this drops to 0 we
// advance the day.
float g_wave_left;
// Spawned this day (server-side, for scaling and stats).
float g_wave_spawned;
// Time of last day change; used by newscast / UI.
float g_day_changed_at;

// Forward decl (defined in upgrades.qc).
void(float day) Upgrades_OfferDay;

// Forward decl (defined in objectives.qc).
void() Objectives_RotateDay;

// Forward decl (defined in intro.qc).
void() Intro_Begin;

// Forward decl: definida más abajo en este archivo. Day_WaveCleared la
// llama antes de su definición porque queremos mantener el orden lógico
// (Init, hooks, WaveCleared, WavePerPickup, ...).
float() Day_WavePerPickup;

// Called from world.qc StartFrame() once.
void() Day_Init =
{
	g_day = 1;
	g_wave_left = 0;
	g_wave_spawned = 0;
	g_day_changed_at = time;
	// Day 1 has no choice (player learns the verb).
	// Days 2..5: the wave-clear hook will offer the choice.
};

// Called by objectives.qc when a civilian spawns.
void() Day_OnCivilianSpawned =
{
	g_wave_left = (g_wave_left + 1);
	g_wave_spawned = (g_wave_spawned + 1);
};

// Called when a civilian is rescued or dies.
void() Day_OnCivilianConsumed =
{
	g_wave_left = (g_wave_left - 1);
	if ((g_wave_left < 0))
	{
		g_wave_left = 0;
	}
};

// Returns TRUE when the wave is over.
//
// Una oleada está cerrada cuando:
//   - Hay al menos un pickup en el mapa.
//   - Todos los pickups han agotado su cuota del día (pickup_spawned_day
//     >= pickup_quota_day).
//   - No quedan civiles vivos pendientes de rescate / muerte
//     (g_wave_left == 0).
//
// Mirar pickups en lugar de un contador global hace que mapas con N
// info_pickup escalen su densidad de forma natural — más pickups, más
// civiles que rescatar antes de cerrar el día.
float() Day_WaveCleared =
{
	local entity p;
	local float any_pickup;
	local float any_quota_left;

	if ((g_wave_left > 0))
	{
		return (FALSE);
	}

	// Recorre pickups y mira si alguno tiene cuota pendiente.
	any_pickup = 0;
	any_quota_left = 0;
	p = find(world, classname, "info_pickup");
	while (p)
	{
		any_pickup = 1;
		// pickup_quota_day se inicializa lazy en pickup_think. Si vale 0
		// (nunca activado) usamos Day_WavePerPickup() como referencia.
		if ((p.pickup_quota_day <= 0))
		{
			if ((Day_WavePerPickup() > 0))
			{
				any_quota_left = 1;
			}
		}
		else
		{
			if ((p.pickup_spawned_day < p.pickup_quota_day))
			{
				any_quota_left = 1;
			}
		}
		p = find(p, classname, "info_pickup");
	}

	if (!any_pickup)
	{
		// Mapa sin info_pickup: nunca se cierra la oleada. El día 1 se
		// queda colgado y los warnings de objectives_init informan.
		return (FALSE);
	}
	if (any_quota_left)
	{
		return (FALSE);
	}
	return (TRUE);
};

// Cuántos civiles spawnea CADA pickup activo este día.
// (Antes era global; ahora se aplica por pickup para que mapas con
// varios info_pickup se sientan vivos y no compitan por una sola cuota.)
float() Day_WavePerPickup =
{
	if ((g_day <= 1))
	{
		return (4);
	}
	if ((g_day == 2))
	{
		return (6);
	}
	if ((g_day == 3))
	{
		return (8);
	}
	if ((g_day == 4))
	{
		return (10);
	}
	// Day 5 = representative-only.
	return (0);
};

// Enemy slot activation threshold per day. info_enemy_slot entities
// check this to decide whether to spawn an actual enemy.
float() Day_SlotActivationPct =
{
	if ((g_day <= 1))
	{
		return (0.20);
	}
	if ((g_day == 2))
	{
		return (0.40);
	}
	if ((g_day == 3))
	{
		return (0.55);
	}
	if ((g_day == 4))
	{
		return (0.75);
	}
	return (0.90);
};

// Number of concurrent pickup zones active. Day 1: 1; later more.
float() Day_PickupConcurrent =
{
	if ((g_day <= 1))
	{
		return (1);
	}
	if ((g_day == 2))
	{
		return (2);
	}
	return (3);
};

// ---------------------------------------------------------------------
// Newscast del día — un único titular por día en el overlay del canal de
// noticias 24h (CNN-7). Sin consola, sin freeze del heli. El texto vive
// en el HUD (airquake_hud.qc), seleccionado por el código de día (1..5)
// que publicamos en .hud_intro → STAT_HUD_INTRO. Aquí solo encendemos el
// código durante NEWS_DAY_DUR y luego lo apagamos.
// ---------------------------------------------------------------------
float NEWS_DAY_DUR = 11;  // segundos que se ve el titular del día (cubre el VO)
float g_news_code;        // código de día actualmente en pantalla (0 = nada)
float g_news_until;       // time en el que se apaga el newscast (0 = inactivo)

// Precacheo de las voces del newscast (una por día, 1..5). Llamado desde
// worldspawn (los precache_* deben hacerse en fase de spawn, no en runtime).
void() News_Precache =
{
	precache_sound("speech/news/day1.wav");
	precache_sound("speech/news/day2.wav");
	precache_sound("speech/news/day3.wav");
	precache_sound("speech/news/day4.wav");
	precache_sound("speech/news/day5.wav");
};

// Enciende el newscast del día `code` durante `dur` segundos para todos
// los jugadores conectados. Además reproduce la voz (TTS) del día.
void(float code, float dur) News_Show =
{
	local entity p;
	local string vo;
	g_news_code = code;
	g_news_until = (time + dur);
	// Ruta de la voz del día (literal por código; evita strcat, no
	// disponible en SSQC).
	vo = "speech/news/day1.wav";
	if (code == 2) { vo = "speech/news/day2.wav"; }
	else if (code == 3) { vo = "speech/news/day3.wav"; }
	else if (code == 4) { vo = "speech/news/day4.wav"; }
	else if (code == 5) { vo = "speech/news/day5.wav"; }
	p = find(world, classname, "player");
	while (p)
	{
		p.hud_intro = code;
		// Voz del canal de noticias, sin atenuación por distancia (locutora).
		sound(p, CHAN_VOICE, vo, 1, ATTN_NORM);
		p = find(p, classname, "player");
	}
};

// Apaga el newscast cuando expira su duración. Llamado cada frame desde
// Day_Tick.
void() News_Tick =
{
	local entity p;
	if ((g_news_until <= 0))
	{
		return;
	}
	if ((time < g_news_until))
	{
		return;
	}
	g_news_until = 0;
	g_news_code = 0;
	p = find(world, classname, "player");
	while (p)
	{
		p.hud_intro = 0;
		p = find(p, classname, "player");
	}
};

// Advance to the next day. Called when the wave clears.
void() Day_Advance =
{
	local entity p;

	if ((g_day >= DAY_MAX))
	{
		// Already on the final day. Nothing to advance to.
		return;
	}
	g_day = (g_day + 1);
	g_day_changed_at = time;
	g_wave_left = 0;
	g_wave_spawned = 0;

	// Newscast del día: un único titular en el overlay del canal de
	// noticias (sin consola). El texto vive en el HUD, seleccionado por
	// el código de día que publicamos aquí.
	News_Show(g_day, NEWS_DAY_DUR);

	// Days 2..5 offer a package choice to all clients. Switch self to
	// each player before calling Upgrades_OfferDay because that function
	// writes self.upgrade_choice_pending / sprints to self. StartFrame
	// runs with self = worldspawn, so calling it raw would crash on
	// "assignment to world entity".
	local entity prev_self;
	prev_self = self;
	p = find(world, classname, "player");
	while (p)
	{
		self = p;
		Upgrades_OfferDay(g_day);
		p = find(p, classname, "player");
	}
	self = prev_self;

	// Tell objectives to spin up the new day's pickups.
	Objectives_RotateDay();
};

// Forward decl (defined in intro.qc).
void() Intro_Tick;
float g_intro_running;  // 1 mientras la intro está activa (definida en intro.qc)
float g_intro_armed;    // 1 si todavía no hemos disparado la intro del día 1

// Frame tick. Detects wave-cleared and advances the day. Called from
// world.qc StartFrame each frame.
void() Day_Tick =
{
	local entity p;

	if ((g_day == 0))
	{
		Day_Init();
		g_intro_armed = 1;  // arma el newscast del día 1 (overlay, sin freeze)
		return;
	}

	// Apaga el newscast del día cuando expira su duración.
	News_Tick();

	// Newscast del día 1: en cuanto hay un jugador conectado lo mostramos
	// una sola vez. Overlay del canal de noticias, sin freeze del heli
	// (el viejo Intro_Begin congelaba el heli y rompía la cámara — queda
	// dormido en intro.qc).
	if (g_intro_armed)
	{
		p = find(world, classname, "player");
		if ((p != world))
		{
			News_Show(1, NEWS_DAY_DUR);
			g_intro_armed = 0;
		}
	}

	if ((g_day >= DAY_MAX))
	{
		// Day 5 ends only when the representative reaches the carrier.
		return;
	}
	if (Day_WaveCleared())
	{
		// Tiny debounce so the wave-spawn frame doesn't immediately
		// trigger an advance on day-start.
		if ((time > (g_day_changed_at + 1)))
		{
			Day_Advance();
		}
	}
};
