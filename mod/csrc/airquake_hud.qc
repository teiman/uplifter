// AirQuake 2026 - CSQC HUD

#define M_PI 3.14159265

#define NUM_WEAPONS 14
#define STAT_HUD_WEP 33
#define STAT_HUD_YAW 34
#define STAT_HUD_VTYPE 35
#define VTYPE_PLANE 1
#define VTYPE_HELO  2
#define VTYPE_GROUND 3
#define STAT_HUD_MISSVIEW 36
#define STAT_HUD_VSTYLE 37
#define STAT_HUD_STARS 38
#define STAT_HUD_SCRAP 39
#define STAT_HUD_CREDITS 40
#define STAT_HUD_PAX 41
#define STAT_HUD_OBJ_DIST   42
#define STAT_HUD_OBJ_DOTFWD 43
#define STAT_HUD_OBJ_DOTRGT 44
#define STAT_HUD_OBJKIND    45
#define STAT_HUD_DANGER     46
#define STAT_HUD_DAY        47
#define STAT_HUD_INTRO      50
#define STAT_HUD_MISSION    51
#define STAT_HUD_QUOTA      52
#define STAT_HUD_AMMO2      53  // hellfire count (helo)
#define STAT_HUD_AMMO3      54  // flare count (helo)
#define STAT_HUD_OBJ_BEARING 55 // world yaw toward active objective (compass)
#define STAT_HUD_SUN_FWD    56  // sun dir · view forward (lens flare)
#define STAT_HUD_SUN_RT     57  // sun dir · view right
#define STAT_HUD_SUN_UP     58  // sun dir · view up
#define STAT_HUD_SUN_VIS    59  // 1 = sun in front & unoccluded by solid
#define STAT_HUD_SAVED      60  // civilians rescued (death summary)
#define STAT_HUD_DISTANCE   61  // distance travelled in units (death summary)
#define STAT_HUD_HELIS      62  // helicopters/lives remaining
#define STAT_HUD_DEAD       63  // 1 while the player is dead → show summary
#define STAT_HUD_SHOTS      64  // total attack actions this run
#define STAT_HUD_GAMEWON    65  // 1 when representative delivered → show win screen

// Height of the bottom mission strip. The rest of the bottom HUD is raised by
// this much so nothing overlaps it. Keep in sync with Hud_DrawMissionBar's
// band_h (22) plus a couple of px of air.
#define MISSION_BAR_H 24

#define NUM_VEHICLES 11

static string wep_pics[NUM_WEAPONS];

static void Hud_Init()
{
	wep_pics[0]  = "gfx/v_auto.lmp";
	wep_pics[1]  = "gfx/v_rock.lmp";
	wep_pics[2]  = "gfx/v_sider.lmp";
	wep_pics[3]  = "gfx/v_amra.lmp";
	wep_pics[4]  = "gfx/v_bomb.lmp";
	wep_pics[5]  = "gfx/v_maver.lmp";
	wep_pics[6]  = "gfx/v_pave.lmp";
	wep_pics[7]  = "gfx/v_hell.lmp";
	wep_pics[8]  = "gfx/v_plas.lmp";
	wep_pics[9]  = "gfx/v_cann.lmp";
	wep_pics[10] = "gfx/v_mine.lmp";
	wep_pics[11] = "gfx/v_rcbo.lmp";
	wep_pics[12] = "gfx/v_sam.lmp";
	wep_pics[13] = "gfx/v_sting.lmp";
};

// Compass heading labels and their yaw angles
// Quake yaw: 0=East, 90=North, 180=West, 270=South
static string compass_labels[8];
static float compass_yaws[8];

static void Hud_DrawCompass(vector virtsize)
{
	float yaw = getstatf(STAT_HUD_YAW);
	// Normalize to 0-360
	yaw = yaw - floor(yaw / 360) * 360;
	if (yaw < 0) yaw = yaw + 360;

	float cx = virtsize_x / 2;   // center x
	float cy = 28;                // y position
	float strip_half = 160;      // half-width of visible strip
	float spacing = 80;          // pixels between each 45-degree mark
	float tick_spacing = spacing / 4.5; // small ticks every ~10 degrees

	// Background strip
	drawfill([cx - strip_half, cy - 10, 0], [strip_half * 2, 20, 0], '0 0 0', 0.3, 0);

	// Center marker (current heading)
	drawfill([cx - 1, cy - 12, 0], [2, 24, 0], '1 1 1', 0.8, 0);

	// Draw compass labels and ticks
	float i;
	for (i = 0; i < 8; i++)
	{
		// Offset in degrees from current yaw
		float diff = compass_yaws[i] - yaw;
		// Wrap to -180..180
		if (diff > 180) diff = diff - 360;
		if (diff < -180) diff = diff + 360;

		// Convert degrees to pixels
		float px = cx + (diff * spacing / 45);

		// Only draw if visible in strip
		if (px > (cx - strip_half + 8) && px < (cx + strip_half - 8))
		{
			// Major tick
			drawfill([px - 1, cy - 6, 0], [2, 12, 0], '1 1 1', 0.6, 0);
			// Label
			float len = strlen(compass_labels[i]);
			drawstring([px - len * 4, cy - 10, 0], compass_labels[i], '8 8 0', '1 1 1', 0.9, 0);
		}
	}

	// Draw minor ticks every ~10 degrees
	float deg;
	for (deg = 0; deg < 360; deg = deg + 10)
	{
		float diff = deg - yaw;
		if (diff > 180) diff = diff - 360;
		if (diff < -180) diff = diff + 360;
		float px = cx + (diff * spacing / 45);
		if (px > (cx - strip_half + 2) && px < (cx + strip_half - 2))
		{
			// Skip major ticks (multiples of 45)
			float mod45 = deg - floor(deg / 45) * 45;
			if (mod45 > 1)
				drawfill([px, cy - 2, 0], [1, 4, 0], '1 1 1', 0.3, 0);
		}
	}

	// Heading number
	string hdg = ftos(floor(yaw));
	float hlen = strlen(hdg);
	drawstring([cx - hlen * 4, cy + 12, 0], hdg, '8 8 0', '0.7 0.9 1', 0.8, 0);

	// ---- Active-objective marker ----
	// When there's a known objective (OBJKIND >= 0), draw a coloured marker
	// on the compass at the objective's world bearing. Colour by kind:
	// pickup = green, deliver/ship = blue. If the bearing is outside the
	// visible strip, pin the marker to the near edge as an arrow pointing the
	// way to turn, so it's always on screen.
	float okind = getstatf(STAT_HUD_OBJKIND);
	if (okind >= 0)
	{
		float obearing = getstatf(STAT_HUD_OBJ_BEARING);
		float odiff = obearing - yaw;
		if (odiff > 180) odiff = odiff - 360;
		if (odiff < -180) odiff = odiff + 360;
		float opx = cx + (odiff * spacing / 45);

		vector ocol = (okind == 0) ? '0.3 1 0.45' : '0.4 0.7 1';  // green / blue
		float edge = strip_half - 6;
		float onscreen = (opx > (cx - edge)) && (opx < (cx + edge));
		if (!onscreen)
		{
			// Pin to the edge in the direction of the target.
			opx = (odiff > 0) ? (cx + edge) : (cx - edge);
		}

		// Downward chevron sitting just under the strip, pointing at the spot.
		float my = cy + 11;
		drawfill([opx - 1, my - 3, 0], [3, 6, 0], '0 0 0', 0.7, 0);   // shadow
		drawfill([opx - 1, my - 4, 0], [3, 6, 0], ocol, 1, 0);        // marker
		if (!onscreen)
		{
			// Little arrowhead toward the edge so it reads as "turn this way".
			float dir = (odiff > 0) ? 1 : -1;
			drawfill([opx + dir * 3, my - 2, 0], [3, 2, 0], ocol, 1, 0);
		}
	}
};

// Vehicle selection screen
static string veh_pics[NUM_VEHICLES];
static string veh_names[NUM_VEHICLES];

static void Hud_InitVehicles()
{
	// style 1-11 -> index 0-10
	veh_pics[0] = "gfx/plane1.lmp";  veh_names[0] = "Dogfighter";
	veh_pics[1] = "gfx/plane2.lmp";  veh_names[1] = "Fighter Bomber";
	veh_pics[2] = "gfx/plane3.lmp";  veh_names[2] = "Stealth Fighter";
	veh_pics[3] = "gfx/plane4.lmp";  veh_names[3] = "A-10";
	veh_pics[4] = "gfx/plane5.lmp";  veh_names[4] = "X-29";
	veh_pics[5] = "gfx/helo1.lmp";   veh_names[5] = "Helicopter";
	veh_pics[6] = "gfx/msam.lmp";    veh_names[6] = "Mobile SAM";
	veh_pics[7] = "gfx/tank.lmp";    veh_names[7] = "Battle Tank";
	veh_pics[8] = "gfx/humvee.lmp";  veh_names[8] = "Armoured Car";
	veh_pics[9] = "gfx/hover.lmp";   veh_names[9] = "Hovercraft";
	veh_pics[10] = "gfx/p9.lmp";    veh_names[10] = "P8 Mech";
};

// Vehicle groups (max 3 members per group)
#define NUM_GROUPS 5
static string grp_names[NUM_GROUPS];
static string grp_keys[NUM_GROUPS];
static float grp_count[NUM_GROUPS];
static float grp_members[15]; // 5 groups x 3 max

static void Hud_InitGroups()
{
	// Group 0 (impulse 1): Jets
	grp_names[0] = "JETS";    grp_keys[0] = "1"; grp_count[0] = 3;
	grp_members[0] = 1;  grp_members[1] = 3;  grp_members[2] = 5;

	// Group 1 (impulse 2): Bombers
	grp_names[1] = "BOMBERS"; grp_keys[1] = "2"; grp_count[1] = 2;
	grp_members[3] = 2;  grp_members[4] = 4;  grp_members[5] = 0;

	// Group 2 (impulse 3): Air
	grp_names[2] = "AIR";     grp_keys[2] = "3"; grp_count[2] = 2;
	grp_members[6] = 6;  grp_members[7] = 10; grp_members[8] = 0;

	// Group 3 (impulse 4): Light
	grp_names[3] = "LIGHT";   grp_keys[3] = "4"; grp_count[3] = 1;
	grp_members[9] = 9;  grp_members[10] = 0; grp_members[11] = 0;

	// Group 4 (impulse 5): Tanks
	grp_names[4] = "TANKS";   grp_keys[4] = "5"; grp_count[4] = 3;
	grp_members[12] = 7; grp_members[13] = 8; grp_members[14] = 11;
};

// Returns group index (0-4) for a style, or -1
static float Hud_GroupForStyle(float vstyle)
{
	float g, i;
	for (g = 0; g < NUM_GROUPS; g++)
	{
		for (i = 0; i < grp_count[g]; i++)
		{
			if (grp_members[g * 3 + i] == vstyle)
				return g;
		}
	}
	return -1;
};

// Pantalla de muerte: ya no hay seleccion de vehiculo. El respawn se hace
// con un click (anti-bogostick en el servidor: si el boton ya estaba pulsado
// al morir, hay que soltarlo y volver a hacer click). Solo dibujamos el
// mensaje "CLICK TO RESPAWN" centrado, con un parpadeo suave. El parametro
// vstyle se mantiene en la firma por compatibilidad con el llamador aunque
// ya no se use.
static void Hud_DrawVehicleSelect(vector virtsize, float vstyle, float alpha)
{
	string hint = "CLICK TO RESPAWN";
	float hlen = strlen(hint);
	drawstring([(virtsize_x - hlen * 14) / 2, virtsize_y / 2 - 8, 0],
		hint, '14 14 0', '1 1 0.6',
		alpha * (0.65 + 0.35 * sin(time * 5)), 0);
};

static void Hud_DrawControls(vector virtsize, float vtype)
{
	vector sz = '8 8 0';
	vector col = '0.7 0.8 0.9';
	float a = 0.6;
	float lh = 10;  // line height

	// Left side - movement controls
	float lx = 8;
	float ly = 40;

	if (vtype == VTYPE_PLANE)
	{
		drawstring([lx, ly, 0],          "MOUSE  steer",    sz, col, a, 0);
		drawstring([lx, ly + lh, 0],     "A/D    roll",     sz, col, a, 0);
		drawstring([lx, ly + lh * 2, 0], "7/8    throttle", sz, col, a, 0);
		drawstring([lx, ly + lh * 3, 0], "W      freelook", sz, col, a, 0);
		drawstring([lx, ly + lh * 4, 0], "S      look back", sz, col, a, 0);
	}
	else if (vtype == VTYPE_HELO)
	{
		drawstring([lx, ly, 0],          "MOUSE  steer",    sz, col, a, 0);
		drawstring([lx, ly + lh, 0],     "A/D    strafe",   sz, col, a, 0);
		drawstring([lx, ly + lh * 2, 0], "7/8    up/down",  sz, col, a, 0);
		drawstring([lx, ly + lh * 3, 0], "W      freelook", sz, col, a, 0);
		drawstring([lx, ly + lh * 4, 0], "RMB    move fwd", sz, col, a, 0);
	}
	else if (vtype == VTYPE_GROUND)
	{
		drawstring([lx, ly, 0],          "MOUSE  turret",   sz, col, a, 0);
		drawstring([lx, ly + lh, 0],     "7/8    throttle", sz, col, a, 0);
		drawstring([lx, ly + lh * 2, 0], "W      freelook", sz, col, a, 0);
		drawstring([lx, ly + lh * 3, 0], "RMB    forward",  sz, col, a, 0);
		drawstring([lx, ly + lh * 4, 0], "E      lock turret", sz, col, a, 0);
	}

	// Right side - weapons/view
	float rx = virtsize_x - 128;
	float ry = 40;

	drawstring([rx, ry, 0],          "1-4    weapons",  sz, col, a, 0);
	drawstring([rx, ry + lh, 0],     "LMB    fire",     sz, col, a, 0);
	drawstring([rx, ry + lh * 2, 0], "5      flare",    sz, col, a, 0);
	drawstring([rx, ry + lh * 3, 0], "Z/X    zoom",     sz, col, a, 0);
	drawstring([rx, ry + lh * 4, 0], "Q      camera",   sz, col, a, 0);
};

// Mission banner in the top-left corner. Shows where to go (PICKUP /
// DELIVER) in red, plus a direction hint (◀ / ▶) when the active marker
// is off-screen.
static void Hud_DrawMission(vector virtsize)
{
	float kind;
	float dotfwd;
	float dotrgt;
	string label;
	string side;
	float text_x;
	float text_y;
	vector textcol;

	kind = getstatf(STAT_HUD_OBJKIND);
	if (kind < 0)
	{
		drawstring([12, 8, 0], "no mission", '10 10 0', '0.5 0.5 0.5', 0.7, 0);
		return;
	}
	if (kind == 2)
	{
		// pax-full but map has no info_ship placed.
		drawstring([12, 8, 0], "FULL — NO SHIP IN MAP", '14 14 0', '1 0.4 0.4', 1, 0);
		return;
	}

	if (kind == 0)
	{
		label = "PICKUP";
	}
	else
	{
		label = "DELIVER";
	}

	dotfwd = getstatf(STAT_HUD_OBJ_DOTFWD);
	dotrgt = getstatf(STAT_HUD_OBJ_DOTRGT);

	if (dotfwd > 0.5)
	{
		side = "";
	}
	else if (dotrgt > 0)
	{
		side = " >>";
	}
	else
	{
		side = "<< ";
	}

	textcol = '1 0.15 0.15';  // bright red
	text_x = 12;
	text_y = 8;
	// Distancia numérica al target eliminada para limpiar el HUD.
	drawstring([text_x + 1, text_y + 1, 0], strcat(side, label), '14 14 0', '0 0 0', 0.7, 0);
	drawstring([text_x, text_y, 0], strcat(side, label), '14 14 0', textcol, 1, 0);
};

// Persistent mission strip along the BOTTOM of the screen, styled like the
// 24h-news lower band (a semi-transparent black band + a coloured label block
// + the objective text). Server packs the current objective into
// STAT_HUD_MISSION: 0 none, 1 fly to pickup, 2 pick up survivors, 3 return
// to ship to deliver.
static void Hud_DrawMissionBar(vector virtsize)
{
	float code;
	float sw;
	float sh;
	string label;       // coloured block on the left
	string text;        // objective description
	vector blockcol;
	float band_h;
	float band_y;
	float block_w;

	code = getstatf(STAT_HUD_MISSION);
	if (code < 1) return;

	sw = virtsize_x;
	sh = virtsize_y;

	if (code == 5)
	{
		label = " EVAC ";
		text  = "Fly the representative to the carrier";
		blockcol = '0.85 0.65 0.10';   // gold = the big day-5 evac
	}
	else if (code == 4)
	{
		label = " VIP ";
		text  = "Pick up the representative";
		blockcol = '0.85 0.65 0.10';   // gold = day-5 objective
	}
	else if (code == 3)
	{
		label = " RETURN ";
		text  = "Deliver the survivors to the ship";
		blockcol = '0.15 0.45 0.85';   // blue = go home
	}
	else if (code == 2)
	{
		label = " RESCUE ";
		text  = "Pick up the survivors";
		blockcol = '0.75 0.05 0.05';   // red = active rescue
	}
	else
	{
		label = " RESCUE ";
		text  = "Fly to the marked pickup";
		blockcol = '0.75 0.05 0.05';
	}

	band_h = 22;
	band_y = sh - band_h;
	block_w = strlen(label) * 10 + 4;

	// Band background.
	drawfill([0, band_y, 0], [sw, band_h, 0], '0 0 0', 0.6, 0);
	// Coloured label block.
	drawfill([0, band_y, 0], [block_w, band_h, 0], blockcol, 1, 0);
	drawstring([2, band_y + 5, 0], label, '10 10 0', '1 1 1', 1, 0);
	// Objective text after the block.
	drawstring([block_w + 8, band_y + 5, 0], text, '10 10 0', '1 1 1', 0.95, 0);
};

// "DANGER" banner under the compass. Shown while the player is above
// stealth altitude (>2 pips off the ground). White by default; red when
// a radar currently has lock. Server packs this into STAT_HUD_DANGER:
// 0=hidden, 1=white DANGER, 2=red DANGER, 3="HIDDEN" (safe inside a cloud).
static void Hud_DrawDanger(vector virtsize)
{
	float st = getstatf(STAT_HUD_DANGER);
	string label;
	vector col;
	vector sz = '14 14 0';
	float w, x, y;

	if (st < 1) return;

	if (st >= 3)
	{
		// Effectively hidden inside a cloud — replace DANGER with a calm
		// green HIDDEN badge.
		label = "HIDDEN";
		col = '0.3 1 0.4';
	}
	else
	{
		label = "DANGER";
		if (st >= 2) col = '1 0.15 0.15';  // red — radar lock
		else         col = '1 1 1';        // white — exposed but no lock
	}

	w = strlen(label) * sz_x;
	x = (virtsize_x - w) / 2;
	y = 56;

	// 1px black drop shadow for legibility over any background.
	drawstring([x + 1, y + 1, 0], label, sz, '0 0 0', 0.7, 0);
	drawstring([x, y, 0], label, sz, col, 1, 0);
};

// "RADAR" banner under DANGER, only when a radar currently has lock
// (hud_danger==2). Flashes white↔red on a ~3Hz cycle so it reads as a
// separate, more urgent alert than the static DANGER label above.
static void Hud_DrawRadar(vector virtsize)
{
	// Exactly 2 (red DANGER + radar lock). st==3 is the cloud-HIDDEN state,
	// which must NOT show the RADAR alert.
	if (getstatf(STAT_HUD_DANGER) != 2) return;

	string label = "RADAR";
	vector sz = '14 14 0';
	float w = strlen(label) * sz_x;
	float x = (virtsize_x - w) / 2;
	float y = 76;

	// 3Hz flash. floor(time*6) toggles every ~0.167s; mod 2 gives the
	// on/off colour swap.
	float phase = floor(time * 6);
	phase = phase - floor(phase / 2) * 2;
	vector col;
	if (phase < 1) col = '1 0.15 0.15';
	else           col = '1 1 1';

	drawstring([x + 1, y + 1, 0], label, sz, '0 0 0', 0.7, 0);
	drawstring([x, y, 0], label, sz, col, 1, 0);
};

// GTA-style 5-star notoriety indicator in the top-right corner.
static void Hud_DrawStars(vector virtsize)
{
	float stars;
	float star_w;
	float star_h;
	float star_gap;
	float total_w;
	float sx;
	float sy;
	float i;
	float xx;
	float alpha;
	vector lit;
	vector dim;
	vector col;

	stars = floor(getstatf(STAT_HUD_STARS));
	if (stars < 0) stars = 0;
	if (stars > 5) stars = 5;

	star_w = 22;
	star_h = 22;
	star_gap = 4;
	total_w = 5 * star_w + 4 * star_gap;
	sx = virtsize_x - total_w - 12;
	sy = 16;

	lit = '1 0.85 0';        // lit yellow
	dim = '0.18 0.18 0.18';  // unlit charcoal

	for (i = 0; i < 5; i = i + 1)
	{
		xx = sx + i * (star_w + star_gap);
		col = dim;
		alpha = 0.5;
		if (i < stars)
		{
			col = lit;
			alpha = 1;
		}
		drawcharacter([xx + 4, sy + 4, 0], '*', [star_w - 8, star_h - 8, 0], col, alpha, 0);
	}

	// Scrap, credits y pax numérico se han retirado del HUD para limpiar
	// la esquina superior derecha. Los muñequitos de Hud_DrawPax siguen
	// indicando los pasajeros a bordo.
};

static float death_time;    // time when we detected death
static float was_alive;     // were we alive last frame?
static float gamewon_time;  // time when mission accomplished first shown

// ---------------------------------------------------------------------
// Intro fade state — track when the BREAKING NEWS overlay appears /
// disappears to crossfade with the normal HUD. fade_alpha goes 0 → 1
// over INTRO_FADE_DUR after the server reports STAT_HUD_INTRO > 0, and
// 1 → 0 over INTRO_FADE_DUR after it drops back to 0.
// ---------------------------------------------------------------------
// Total length of the wipe. The triangle peaks at half this value, so
// 1.2 s ≈ 0.6 s fading to black + 0.6 s fading back.
#define INTRO_FADE_DUR 1.2
static float intro_fade_alpha;       // 0..1: 0 = HUD normal, 1 = newscast
static float intro_last_phase;       // last seen STAT_HUD_INTRO
static float intro_fade_dir_time;    // time when current fade started

// ---------------------------------------------------------------------
// Hud_DrawNewscast — BREAKING NEWS cable-news overlay (day-1 intro).
//
// Estilo de canal de noticias 24h:
//   - Banda negra en la parte inferior con el headline en blanco.
//   - Bloque rojo "BREAKING NEWS" pegado al borde izquierdo de la banda.
//   - Logo "CNN-7" arriba a la izquierda (placeholder textual).
//   - Reloj ficticio arriba a la derecha (incrementa con `time`).
//   - Ticker secundario debajo con texto que se desplaza horizontalmente.
//
// El código (news_phase = 1..5 = día) selecciona el titular y la
// sub-línea. Un único titular por día.
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Hud_DrawPax — ASCII stick-figure indicator of passengers on board.
//
// Renderiza 8 muñequitos en la esquina inferior izquierda. Los ocupados
// (índice < pax) salen en color, los huecos en gris pálido. Cada muñeco
// son 3 columnas × 3 filas de caracteres ASCII:
//
//  o  ← cabeza
//  |  ← cuerpo

// ---------------------------------------------------------------------
static void Hud_DrawPax(vector vsz, float pax_count, float pax_alpha)
{
	float cap;
	float ch;
	float fig_w;
	float fig_gap;
	float row_h;
	float row_w;
	float base_x;
	float base_y;
	float i;
	float fx;
	vector pcol;

	if (pax_alpha <= 0)
		return;

	cap = 8;
	ch = 8;
	fig_w = ch;          // 1 char wide per figure now (head 'o' over body '|')
	fig_gap = 4;
	row_h = ch;
	row_w = cap * (fig_w + fig_gap);
	// Bottom-left, just ABOVE the ammo bars + their "AMMO" caption, and to the
	// RIGHT of the health bar (x=6, ~20u wide) so nothing overlaps. Each
	// figure is 2 rows tall (head + body) plus the PAX caption. Sits ~48u
	// above the ammo block so there's a clean gap above the "AMMO" label.
	base_x = 32;
	base_y = vsz_y - row_h * 2 - 48 - MISSION_BAR_H;

	// Small "PAX" caption above the row.
	drawstring([base_x, base_y - 11, 0], "PAX", '8 8 0', '0.5 0.85 1', pax_alpha, 0);

	for (i = 0; i < cap; i++)
	{
		fx = base_x + i * (fig_w + fig_gap);
		if (i < pax_count)
			pcol = '0.5 0.85 1';   // llenos — azul claro
		else
			pcol = '0.4 0.4 0.4';  // huecos — gris
		drawstring([fx, base_y, 0],          "o", [ch, ch, 0], pcol, pax_alpha, 0);
		drawstring([fx, base_y + row_h, 0],  "|", [ch, ch, 0], pcol, pax_alpha, 0);
	}
};

// "DAY n" badge, top-left under the compass area. A small amber tag showing
// which of the 5 days is in progress (STAT_HUD_DAY).
static void Hud_DrawDay(vector virtsize)
{
	float dnum;
	string txt;
	float tw;

	dnum = getstatf(STAT_HUD_DAY);
	if (dnum < 1) return;

	txt = strcat("DAY ", ftos(dnum));
	tw = strlen(txt) * 12 + 12;
	// Amber tag block + text, near the top-left corner.
	drawfill([10, 30, 0], [tw, 20, 0], '0.55 0.4 0.05', 0.85, 0);
	drawstring([16, 33, 0], txt, '12 12 0', '1 0.95 0.6', 1, 0);
};

// ---------------------------------------------------------------------
// Hud_DrawNormal — the regular in-vehicle HUD. Everything that's not the
// BREAKING NEWS intro overlay lives here. Called from Hud_Draw only when
// no intro is active.
// ---------------------------------------------------------------------
static void Hud_DrawNormal(vector virtsize)
{
	float health = getstatf(STAT_HEALTH);
	float ammo = getstatf(STAT_AMMO);
	float wepid = getstatf(STAT_HUD_WEP);
	float wepmdl = getstati(STAT_WEAPONMODELI);
	float vtype = getstatf(STAT_HUD_VTYPE);

	if (health < 0) health = 0;
	if (ammo < 0 || ammo > 1000) ammo = 0;

	Hud_DrawCompass(virtsize);
	Hud_DrawDanger(virtsize);
	Hud_DrawRadar(virtsize);
	Hud_DrawMission(virtsize);
	Hud_DrawMissionBar(virtsize);
	Hud_DrawDay(virtsize);

	// Health bar (left edge, vertical) - only in vehicle.
	if (health > 0 && wepmdl)
	{
		float bar_w = 16;
		float bar_h = 120;
		float border = 2;
		float bar_x = 6;
		float bar_y = virtsize_y - bar_h - 6 - MISSION_BAR_H;
		float frac = health / 100;
		if (frac > 1) frac = 1;
		float fill_h = bar_h * frac;

		vector hpcolor = '0 1 0';
		if (frac < 0.25) hpcolor = '1 0 0';
		else if (frac < 0.40) hpcolor = '1 1 0';

		drawfill([bar_x - border, bar_y - border, 0], [bar_w + border * 2, bar_h + border * 2, 0], '0.3 0.3 0.3', 0.6, 0);
		drawfill([bar_x, bar_y, 0], [bar_w, bar_h, 0], '0 0 0', 0.5, 0);
		drawfill([bar_x, bar_y + bar_h - fill_h, 0], [bar_w, fill_h, 0], hpcolor, 0.9, 0);
	}

	// Pax indicator (replaces the old speed bars) — ASCII stick figures
	// in the bottom-left, immediately to the right of the health bar.
	float pax_now = floor(getstatf(STAT_HUD_PAX));
	Hud_DrawPax(virtsize, pax_now, 1);

	// Ammo bars (bottom, after the pax row).
	if (wepmdl && ammo >= 0)
	{
		float ammo_row_w = 300;
		float ammo_h = 8;
		float ammo_row_gap = 2;
		float ammo_x = 32;     // close to the health bar (which ends ~x=24)

		float count = floor(ammo);
		if (count < 1) count = 0;

		float gap = 1;
		float bar_w;
		if (count <= 10)
			bar_w = 12;
		else if (count <= 30)
			bar_w = 6;
		else
			bar_w = 3;

		float per_row = floor(ammo_row_w / (bar_w + gap));
		if (per_row < 1) per_row = 1;
		float num_rows = ceil(count / per_row);
		if (num_rows < 1) num_rows = 1;

		float ammo_y = virtsize_y - num_rows * (ammo_h + ammo_row_gap) - 6 - MISSION_BAR_H;

		drawstring([ammo_x, ammo_y - 10, 0], strcat("AMMO ", ftos(floor(ammo))), '8 8 0', '1 1 0', 0.8, 0);

		float j;
		for (j = 0; j < count; j++)
		{
			float row = floor(j / per_row);
			float col = j - row * per_row;
			float bx = ammo_x + col * (bar_w + gap);
			float by = ammo_y + row * (ammo_h + ammo_row_gap);
			drawfill([bx, by, 0], [bar_w, ammo_h, 0], '1 1 0', 0.8, 0);
		}
	}

	// Weapon display (bottom-right corner).
	if (wepmdl && vtype == VTYPE_HELO)
	{
		// Strip de 3 armas para el heli: 1=AUTO  2=HELLFIRE  3=FLARES
		float ammo2 = getstatf(STAT_HUD_AMMO2);
		float ammo3 = getstatf(STAT_HUD_AMMO3);

		// Slot activo: wepid 0=gun, 7=hell, 20=flares
		float active_slot;
		if (wepid == 0) active_slot = 0;
		else if (wepid == 7) active_slot = 1;
		else active_slot = 2;

		float slot_w = 148;
		float slot_h = 38;
		float slot_gap = 3;
		float strip_h = slot_h * 3 + slot_gap * 2;
		float sx = virtsize_x - slot_w - 6;
		float sy0 = virtsize_y - strip_h - 6 - MISSION_BAR_H;

		float si;
		for (si = 0; si < 3; si++)
		{
			float sy = sy0 + si * (slot_h + slot_gap);
			float active = (si == active_slot);
			float icon_alpha = active ? 0.95 : 0.4;
			vector txt_col = active ? '1 1 1' : '0.55 0.55 0.55';

			// Fondo del slot
			drawfill([sx, sy, 0], [slot_w, slot_h, 0], '0 0 0', active ? 0.55 : 0.22, 0);
			// Barra izquierda verde si activo
			if (active)
				drawfill([sx, sy, 0], [2, slot_h, 0], '0.2 0.9 0.2', 0.95, 0);

			// Numero de tecla
			drawstring([sx + 5, sy + slot_h/2 - 6, 0], ftos(si + 1), '12 12 0', txt_col, 1, 0);

			if (si == 0)  // ametralladora
			{
				drawpic([sx + 20, sy + 2, 0], wep_pics[0], [66, 34, 0], '1 1 1', icon_alpha, 0);
				drawstring([sx + 90, sy + slot_h/2 - 4, 0], "AUTO", '8 8 0', txt_col, 0.8, 0);
			}
			else if (si == 1)  // hellfire
			{
				drawpic([sx + 20, sy + 2, 0], wep_pics[7], [66, 34, 0], '1 1 1', icon_alpha, 0);
				// Pips de municion (max 4)
				float pi;
				for (pi = 0; pi < 4; pi++)
				{
					vector pcol = (pi < ammo2) ? '1 0.45 0' : '0.25 0.25 0.25';
					drawfill([sx + 90 + pi * 12, sy + slot_h/2 - 4, 0], [9, 9, 0], pcol, 0.9, 0);
				}
			}
			else  // flares
			{
				drawstring([sx + 20, sy + slot_h/2 - 5, 0], "FLARES", '10 10 0',
					active ? '1 1 0.4' : '0.5 0.5 0.2', 0.9, 0);
				// Pips de municion (max 6)
				float fi;
				for (fi = 0; fi < 6; fi++)
				{
					vector fcol = (fi < ammo3) ? '0.7 0.85 1' : '0.2 0.2 0.2';
					drawfill([sx + 88 + fi * 9, sy + slot_h/2 - 4, 0], [7, 9, 0], fcol, 0.9, 0);
				}
			}
		}
	}
	else if (wepmdl && wepid >= 0 && wepid < NUM_WEAPONS)
	{
		// Icono unico para vehiculos que no son el heli
		vector picsize = [66 * 2, 34 * 2, 0];
		vector picpos = [virtsize_x - picsize_x - 6, virtsize_y - picsize_y - 6 - MISSION_BAR_H, 0];
		drawpic(picpos, wep_pics[wepid], picsize, '1 1 1', 0.9, 0);
	}

	// Missile view indicator (bottom center).
	if (getstatf(STAT_HUD_MISSVIEW))
	{
		string mvtxt = "[ MISSILE VIEW ]";
		float mvlen = strlen(mvtxt) * 8;
		drawstring([virtsize_x / 2 - mvlen / 2, virtsize_y - 16 - MISSION_BAR_H, 0], mvtxt, '8 8 0', '1 0.3 0.3', 1, 0);
	}

	Hud_DrawStars(virtsize);
};

static void Hud_DrawNewscast(float news_w, float news_h, float news_phase)
{
	if (news_phase <= 0)
		return;
	float sw = news_w;
	float sh = news_h;

	// ---- top bar (logo + clock) ----
	float top_h = 22;
	drawfill([0, 0, 0], [sw, top_h, 0], '0 0 0', 0.55, 0);
	drawstring([12, 6, 0], "CNN-7  LIVE", '10 10 0', '1 0.85 0.3', 1, 0);
	// Fake clock that ticks with `time`. HH:MM:SS, base 08:03:00.
	float secs_base = 28980 + floor(time);
	float hh = floor(secs_base / 3600) % 24;
	float mm = floor(secs_base / 60) % 60;
	float ss = secs_base % 60;
	string clk = strcat(ftos(hh), ":", ftos(mm), ":", ftos(ss));
	drawstring([sw - 90, 6, 0], clk, '10 10 0', '1 1 1', 0.9, 0);

	// ---- bottom band ----
	float band_h = 64;
	float band_y = sh - band_h;
	drawfill([0, band_y, 0], [sw, band_h, 0], '0 0 0', 0.78, 0);

	// "BREAKING NEWS" red block.
	float red_w = 220;
	drawfill([0, band_y, 0], [red_w, 28, 0], '0.75 0.05 0.05', 1, 0);
	drawstring([16, band_y + 6, 0], "BREAKING NEWS", '14 14 0', '1 1 1', 1, 0);

	// Headline + sub-line, seleccionados por el código de día (1..5).
	// Un único titular por día (ver revision_television.md / dias.md).
	string headline;
	string subline;
	if (news_phase == 1)
	{
		headline = "GOLIATH FORCES SURROUND DAVENPORT - OIL DISPUTE TURNS VIOLENT";
		subline  = "Coastal city of Davenport has been ringed by Goliath armour overnight.";
	}
	else if (news_phase == 2)
	{
		headline = "GOLIATH ARTILLERY STRIKES CIVILIAN BLOCKS";
		subline  = "Casualties mount overnight as the cordon tightens.";
	}
	else if (news_phase == 3)
	{
		headline = "FIELD HOSPITAL DESTROYED";
		subline  = "Goliath jets struck a Davenport medical centre at dawn.";
	}
	else if (news_phase == 4)
	{
		headline = "CORDON HARDENS AROUND THE CITY";
		subline  = "Goliath has reinforced the perimeter with heavy armour.";
	}
	else
	{
		headline = "USS CARRIER ARRIVES OFFSHORE";
		subline  = "International coalition prepares to receive a Davenport envoy.";
	}
	drawstring([red_w + 16, band_y + 6, 0], headline, '12 12 0', '1 1 1', 1, 0);

	// Sub-line (second row inside the band): context summary.
	drawstring([16, band_y + 34, 0], subline, '10 10 0', '0.85 0.85 0.85', 0.95, 0);

	// ---- ticker (third row at the very bottom, scrolling) ----
	float ticker_h = 18;
	float ticker_y = sh - ticker_h;
	drawfill([0, ticker_y, 0], [sw, ticker_h, 0], '0.05 0.05 0.05', 0.95, 0);
	// Scroll with `time`. We draw the string twice, offset by 1200 px,
	// so it loops seamlessly when one copy goes off-screen.
	float scroll_speed = 70;
	float offset = (time * scroll_speed) % 1200;
	string ticker = "  *  GOLIATH DENIES TARGETING CIVILIANS  *  COALITION WEIGHS RESPONSE  *  CASUALTIES MOUNT ACROSS DAVENPORT  *  USS CARRIER ON STATION  *";
	drawstring([sw - offset, ticker_y + 3, 0], ticker, '11 11 0', '1 1 0.7', 1, 0);
	drawstring([sw + 1200 - offset, ticker_y + 3, 0], ticker, '11 11 0', '1 1 0.7', 1, 0);
};

// Day briefing curtain: a dark full-screen blackout with a highlighted
// horizontal band across the middle showing "DIA N" big on top and a smaller
// "QUOTA: n" beneath it. Shown between days (STAT_HUD_INTRO > 0).
static void Hud_DrawDayBriefing(vector virtsize)
{
	float sw;
	float sh;
	float dnum;
	float quota;
	string dtxt;
	string qtxt;
	float band_h;
	float band_y;
	float dw;
	float qw;

	sw = virtsize_x;
	sh = virtsize_y;
	dnum = getstatf(STAT_HUD_DAY);
	quota = getstatf(STAT_HUD_QUOTA);

	// Full-screen blackout curtain.
	drawfill([0, 0, 0], [sw, sh, 0], '0 0 0', 0.92, 0);

	// Highlighted horizontal band across the centre.
	band_h = 120;
	band_y = (sh - band_h) / 2;
	drawfill([0, band_y, 0], [sw, band_h, 0], '0.08 0.12 0.2', 1, 0);
	// Thin accent lines top and bottom of the band.
	drawfill([0, band_y, 0],              [sw, 3, 0], '0.85 0.7 0.2', 1, 0);
	drawfill([0, band_y + band_h - 3, 0], [sw, 3, 0], '0.85 0.7 0.2', 1, 0);

	// "DAY N" big, centred near the top of the band.
	dtxt = strcat("DAY ", ftos(dnum));
	dw = strlen(dtxt) * 28;                  // 28px glyph advance
	drawstring([(sw - dw) / 2, band_y + 24, 0], dtxt, '28 28 0', '1 1 1', 1, 0);

	// "QUOTA: n" smaller, centred below.
	qtxt = strcat("QUOTA: ", ftos(quota));
	qw = strlen(qtxt) * 14;
	drawstring([(sw - qw) / 2, band_y + 74, 0], qtxt, '14 14 0', '0.85 0.9 1', 1, 0);
};

// ---------------------------------------------------------------------
// Hud_DrawDeathSummary — resumen breve al morir. Muestra cuantos civiles
// has salvado y la distancia recorrida (la "vida" de esta partida), y
// debajo los helicopteros que te quedan. Aparece centrado, con un fade
// de entrada, durante los primeros segundos de la muerte; despues cede
// el sitio a la pantalla de seleccion de vehiculo. `alpha` lo controla el
// llamador segun el tiempo transcurrido desde la muerte.
// ---------------------------------------------------------------------
static void Hud_DrawDeathSummary(vector virtsize, float alpha)
{
	float saved;
	float dist;
	float helis;
	float km;
	string txt;
	float tw;
	float cx;
	float panel_w;
	float panel_h;
	float panel_x;
	float panel_y;
	float row_y;
	float n;
	float icon_total;
	float icon_x;

	saved = getstatf(STAT_HUD_SAVED);
	dist  = getstatf(STAT_HUD_DISTANCE);
	helis = getstatf(STAT_HUD_HELIS);
	if (saved < 0) saved = 0;
	if (dist < 0) dist = 0;
	if (helis < 0) helis = 0;

	cx = virtsize_x * 0.5;
	panel_w = 360;
	panel_h = 150;
	panel_x = cx - panel_w * 0.5;
	panel_y = virtsize_y * 0.30;

	// Panel oscuro de fondo.
	drawfill([panel_x, panel_y, 0], [panel_w, panel_h, 0],
		'0 0 0', 0.7 * alpha, 0);
	// Filo superior ambar.
	drawfill([panel_x, panel_y, 0], [panel_w, 3, 0],
		'0.9 0.7 0.2', alpha, 0);

	// Titulo.
	txt = "MISSION OVER";
	tw = strlen(txt) * 14;
	drawstring([cx - tw * 0.5, panel_y + 14, 0], txt, '14 14 0',
		'1 0.5 0.4', alpha, 0);

	row_y = panel_y + 48;

	// Civiles salvados.
	txt = strcat("CIVILIANS SAVED   ", ftos(saved));
	tw = strlen(txt) * 10;
	drawstring([cx - tw * 0.5, row_y, 0], txt, '10 10 0',
		'0.7 1 0.7', alpha, 0);

	// Distancia recorrida. Las unidades de Quake son ~ pies; convertimos a
	// "km" de juego dividiendo entre 1000 para una cifra legible.
	km = dist / 1000;
	txt = strcat("DISTANCE FLOWN    ", ftos(floor(km * 10) / 10));
	txt = strcat(txt, " km");
	tw = strlen(txt) * 10;
	drawstring([cx - tw * 0.5, row_y + 18, 0], txt, '10 10 0',
		'0.7 0.9 1', alpha, 0);

	// Separador.
	drawfill([panel_x + 30, row_y + 42, 0], [panel_w - 60, 1, 0],
		'1 1 1', 0.3 * alpha, 0);

	// Helicopteros restantes (empiezas con 3). Iconos como cuadrados.
	txt = "HELICOPTERS LEFT";
	tw = strlen(txt) * 9;
	drawstring([cx - tw * 0.5, row_y + 52, 0], txt, '9 9 0',
		'0.9 0.9 0.9', alpha, 0);

	icon_total = helis * 18 - 4;     // 14 wide + 4 gap, sin gap final
	if (icon_total < 0) icon_total = 0;
	icon_x = cx - icon_total * 0.5;
	n = 0;
	while (n < helis)
	{
		drawfill([icon_x + n * 18, row_y + 70, 0], [14, 10, 0],
			'0.4 0.8 1', alpha, 0);
		drawfill([icon_x + n * 18 + 2, row_y + 72, 0], [10, 6, 0],
			'0.7 0.9 1', alpha, 0);
		n = n + 1;
	}
};

static void Hud_DrawMissionAccomplished(vector virtsize, float alpha)
{
	float saved;
	float dist;
	float shots;
	float km;
	string txt;
	float tw;
	float cx;
	float panel_w;
	float panel_h;
	float panel_x;
	float panel_y;
	float row_y;

	saved  = getstatf(STAT_HUD_SAVED);
	dist   = getstatf(STAT_HUD_DISTANCE);
	shots  = getstatf(STAT_HUD_SHOTS);
	if (saved  < 0) saved  = 0;
	if (dist   < 0) dist   = 0;
	if (shots  < 0) shots  = 0;

	cx      = virtsize_x * 0.5;
	panel_w = 420;
	panel_h = 230;
	panel_x = cx - panel_w * 0.5;
	panel_y = virtsize_y * 0.18;

	// Fondo negro semitransparente sobre toda la pantalla.
	drawfill([0, 0, 0], [virtsize_x, virtsize_y, 0], '0 0 0', 0.75 * alpha, 0);

	// Panel central oscuro.
	drawfill([panel_x, panel_y, 0], [panel_w, panel_h, 0],
		'0.05 0.10 0.05', 0.92 * alpha, 0);

	// Borde superior verde.
	drawfill([panel_x, panel_y, 0], [panel_w, 4, 0],
		'0.2 0.9 0.3', alpha, 0);
	// Borde inferior verde oscuro.
	drawfill([panel_x, panel_y + panel_h - 2, 0], [panel_w, 2, 0],
		'0.1 0.5 0.15', alpha, 0);

	// Título.
	txt = "MISSION ACCOMPLISHED";
	tw  = strlen(txt) * 18;
	drawstring([cx - tw * 0.5, panel_y + 14, 0], txt, '18 18 0',
		'0.3 1 0.4', alpha, 0);

	// Subtítulo.
	txt = "United Nations intervened - peace deal signed";
	tw  = strlen(txt) * 8;
	drawstring([cx - tw * 0.5, panel_y + 44, 0], txt, '8 8 0',
		'0.7 0.85 0.7', alpha * 0.9, 0);

	// Separador.
	drawfill([panel_x + 30, panel_y + 64, 0], [panel_w - 60, 1, 0],
		'0.2 0.6 0.25', 0.6 * alpha, 0);

	row_y = panel_y + 80;

	// Civiles rescatados.
	txt = strcat("CIVILIANS RESCUED   ", ftos(saved));
	tw  = strlen(txt) * 10;
	drawstring([cx - tw * 0.5, row_y, 0], txt, '10 10 0',
		'0.5 1 0.55', alpha, 0);

	// Distancia recorrida.
	km  = dist / 1000;
	txt = strcat("DISTANCE FLOWN      ", ftos(floor(km * 10) / 10));
	txt = strcat(txt, " km");
	tw  = strlen(txt) * 10;
	drawstring([cx - tw * 0.5, row_y + 22, 0], txt, '10 10 0',
		'0.5 0.85 1', alpha, 0);

	// Disparos realizados.
	txt = strcat("SHOTS FIRED         ", ftos(shots));
	tw  = strlen(txt) * 10;
	drawstring([cx - tw * 0.5, row_y + 44, 0], txt, '10 10 0',
		'1 0.9 0.5', alpha, 0);

	// Separador inferior.
	drawfill([panel_x + 30, row_y + 68, 0], [panel_w - 60, 1, 0],
		'0.2 0.6 0.25', 0.4 * alpha, 0);

	// Mensaje de cierre.
	txt = "Thank you for your service.";
	tw  = strlen(txt) * 9;
	drawstring([cx - tw * 0.5, row_y + 82, 0], txt, '9 9 0',
		'0.6 0.8 0.6', alpha * 0.8, 0);
};

static void Hud_Draw(vector virtsize, float showscores)
{
	float health = getstatf(STAT_HEALTH);
	float ammo = getstatf(STAT_AMMO);
	float armor = getstatf(STAT_ARMOR);  // speed
	float wepid = getstatf(STAT_HUD_WEP);

	if (health < 0) health = 0;
	if (ammo < 0 || ammo > 1000) ammo = 0;
	if (armor < 0 || armor > 1000) armor = 0;

	float wepmdl = getstati(STAT_WEAPONMODELI);
	float vtype = getstatf(STAT_HUD_VTYPE);

	// Mission accomplished screen — overrides everything, fades in over 1s.
	float gamewon = getstatf(STAT_HUD_GAMEWON);
	if (gamewon)
	{
		if (!gamewon_time)
			gamewon_time = time;
		float gw_a = (time - gamewon_time);
		if (gw_a > 1) gw_a = 1;
		Hud_DrawMissionAccomplished(virtsize, gw_a);
		return;
	}
	gamewon_time = 0;

	// Track death transition
	float is_dead = (!wepmdl || health <= 2);
	if (is_dead && was_alive)
		death_time = time;  // just died
	if (!is_dead)
		was_alive = 1;
	else
		was_alive = 0;

	// Vehicle selection screen (when not in vehicle, or dead)
	float vstyle = getstatf(STAT_HUD_VSTYLE);
	if (is_dead)
	{
		float delay = 4;     // segundos antes de mostrar "CLICK TO RESPAWN"
		float fadein = 1;    // segundos de fade-in del mensaje de respawn
		float elapsed = time - death_time;
		float sum_a;
		float vsel_a;

		// Resumen de la "vida": civiles salvados, distancia recorrida y
		// helis restantes. Aparece de inmediato al morir, se mantiene unos
		// segundos y se desvanece justo cuando entra el "CLICK TO RESPAWN".
		// Fade-in 0.4s, sostenido hasta 3s, fade-out 1s (termina a los 4s).
		if (elapsed < 4)
		{
			sum_a = 1;
			if (elapsed < 0.4)
				sum_a = elapsed / 0.4;       // fade-in
			else if (elapsed > 3)
				sum_a = (4 - elapsed) / 1;   // fade-out
			if (sum_a < 0) sum_a = 0;
			if (sum_a > 1) sum_a = 1;
			Hud_DrawDeathSummary(virtsize, sum_a);
		}

		// Ya no hay seleccion de vehiculo: en cuanto el resumen se desvanece
		// mostramos "CLICK TO RESPAWN" hasta que el jugador reaparezca.
		if (elapsed > delay)
		{
			vsel_a = (elapsed - delay) / fadein;
			if (vsel_a > 1) vsel_a = 1;
			Hud_DrawVehicleSelect(virtsize, vstyle, vsel_a);
		}
		return;
	}

	// ---- Intro newscast vs normal HUD (black-wipe transition) ----
	//
	// El swap del HUD se hace en el centro del fade, cuando la pantalla
	// está al 100% en negro. Mecánica:
	//
	//   1. Server cambia STAT_HUD_INTRO (target_phase).
	//   2. Detectamos el cambio: arrancamos el fade a `intro_fade_dir_time`
	//      pero NO actualizamos `displayed_phase` aún.
	//   3. Durante la primera mitad del fade (p < 0.5), seguimos
	//      pintando lo que había antes con el negro creciendo encima.
	//   4. Al cruzar p=0.5 (negro total), actualizamos `displayed_phase`
	//      al target. Como la pantalla está negra, no se ve el cambio.
	//   5. Segunda mitad del fade (p >= 0.5): pintamos el nuevo HUD con
	//      el negro reduciendo: fade-in del nuevo.
	float target_phase = getstatf(STAT_HUD_INTRO);
	if (target_phase != intro_last_phase)
	{
		intro_fade_dir_time = time;
		intro_last_phase = target_phase;
	}
	float t_since_change = time - intro_fade_dir_time;
	float in_fade = (t_since_change < INTRO_FADE_DUR);
	float black_alpha = 0;
	float p = 0;
	if (in_fade)
	{
		p = t_since_change / INTRO_FADE_DUR;
		// Triangle: 0 → 1 → 0 across [0..1], peaking at 0.5.
		if (p < 0.5)
			black_alpha = p * 2;
		else
			black_alpha = (1 - p) * 2;
	}

	// Swap exactly at p=0.5 (la pantalla está totalmente en negro ahí).
	// Antes de p=0.5 pintamos lo viejo; después, lo nuevo.
	float visible_phase;
	if (in_fade && p < 0.5)
	{
		// Mitad de entrada: el HUD viejo es el "no target". Si vamos
		// hacia intro (target_phase>0), lo viejo es 0; si volvemos
		// (target_phase==0), lo viejo es 1.
		if (target_phase > 0)
			visible_phase = 0;
		else
			visible_phase = 1;
	}
	else
	{
		visible_phase = target_phase;
	}

	if (visible_phase > 0)
	{
		Hud_DrawDayBriefing(virtsize);
	}
	else
	{
		Hud_DrawNormal(virtsize);
	}

	// Capa negra encima durante el fade. Al peak (p=0.5) cubre todo,
	// haciendo el swap invisible.
	if (black_alpha > 0)
	{
		drawfill([0, 0, 0], virtsize, '0 0 0', black_alpha, 0);
	}
};

// ---------------------------------------------------------------------
// Sun lens flare (screen-space, 2D overlay)
// ---------------------------------------------------------------------
//
// This engine's CSQC has NO getproperty (view) and NO traceline (server-only)
// builtins, so the SERVER does the 3D work and hands us the result as stats:
//   STAT_HUD_SUN_FWD/RT/UP : the sun direction projected onto the player's
//                            view axes (dot with v_forward / v_right / v_up).
//   STAT_HUD_SUN_VIS       : 1 = sun is in front AND not blocked by solid
//                            world (terrain/buildings); 0 = hide the flare.
// We just project (rt/fwd, up/fwd) onto the screen with an assumed FOV and
// draw the glow + halo chain additively. Clouds are non-solid so the flare
// glows through them (by design).
float SUN_FOV_X = 90;   // assumed horizontal FOV for the screen projection

static void Hud_DrawLensFlare(vector virtsize)
{
	float fwd;
	float rt;
	float up;
	float scrdist;
	float cx;
	float cy;
	float sx;
	float sy;
	float i;
	float t;
	float fx;
	float fy;
	float fsz;
	float vis;
	float dsun;
	float nearfade;

	if (getstatf(STAT_HUD_SUN_VIS) < 1) return;   // sun behind the camera

	fwd = getstatf(STAT_HUD_SUN_FWD);
	if (fwd <= 0.05) return;
	rt = getstatf(STAT_HUD_SUN_RT);
	up = getstatf(STAT_HUD_SUN_UP);

	scrdist = (virtsize_x * 0.5) / tan(SUN_FOV_X * 0.5 * M_PI / 180);

	cx = virtsize_x * 0.5;
	cy = virtsize_y * 0.5;
	sx = cx + (rt / fwd) * scrdist;
	sy = cy - (up / fwd) * scrdist;

	// This engine ignores the additive drawflag but honours ALPHA, so we draw
	// the pale gfx ALPHA-BLENDED at low opacity: a translucent veil of light
	// that mixes into the sky, not opaque discs. Soft falloff in the gfx +
	// low alpha = a flare, not a physical object.
	//
	// Fade the whole flare as the sun moves off-axis (brightest dead-ahead).
	vis = fwd;
	if (vis > 1) vis = 1;

	fsz = 110;
	drawpic([sx - fsz*0.5, sy - fsz*0.5, 0], "gfx/lens_glow.lmp",
		[fsz, fsz, 0], '1 1 0.92', 0.5 * vis, 0);

	// Flare halo chain along the line from the sun through screen centre.
	for (i = 0; i < 6; i = i + 1)
	{
		t = 0.25 + i * 0.32;          // positions along the sun→centre→far line
		fx = sx + (cx - sx) * t;
		fy = sy + (cy - sy) * t;
		fsz = 24 + (i & 1) * 18;      // alternate small/large rings
		vector hc;
		if (i == 0)      hc = '0.85 0.9 1.0';
		else if (i == 2) hc = '1.0 0.92 0.82';
		else if (i == 4) hc = '0.9 1.0 0.9';
		else             hc = '1 1 1';
		// Fade halos to fully transparent near the sun (where the glow lives
		// and a halo would look wrong): 0 within ~90px of the sun, full beyond
		// ~220px.
		dsun = sqrt((fx - sx)*(fx - sx) + (fy - sy)*(fy - sy));
		nearfade = (dsun - 90) / 130;
		if (nearfade < 0) nearfade = 0;
		if (nearfade > 1) nearfade = 1;
		// Halo opacity: dropped 30% from before (0.22 → 0.154), times the
		// off-axis fade and the near-sun fade.
		drawpic([fx - fsz*0.5, fy - fsz*0.5, 0], "gfx/lens_ring.lmp",
			[fsz, fsz, 0], hc, 0.154 * vis * nearfade, 0);
	}
};

void(vector virtsize, float showscores) CSQC_DrawHud =
{
	Hud_DrawLensFlare(virtsize);
	Hud_Draw(virtsize, showscores);
};

void(vector virtsize, float showscores) CSQC_DrawScores =
{
};

void(float apilevel, string enginename, float engineversion) CSQC_Init =
{
	Hud_Init();
	Hud_InitVehicles();
	Hud_InitGroups();

	// Compass: Quake yaw 0=East, 90=North, 180=West, 270=South
	compass_labels[0] = "E";  compass_yaws[0] = 0;
	compass_labels[1] = "NE"; compass_yaws[1] = 45;
	compass_labels[2] = "N";  compass_yaws[2] = 90;
	compass_labels[3] = "NW"; compass_yaws[3] = 135;
	compass_labels[4] = "W";  compass_yaws[4] = 180;
	compass_labels[5] = "SW"; compass_yaws[5] = 225;
	compass_labels[6] = "S";  compass_yaws[6] = 270;
	compass_labels[7] = "SE"; compass_yaws[7] = 315;

	// Hide the v_model since CSQC draws the weapon HUD instead
	localcmd("r_drawviewmodel 0\n");
};
