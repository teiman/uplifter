// AirQuake 2026 - CSQC HUD

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
#define STAT_HUD_INTRO      50

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

static void Hud_DrawVehicleSelect(vector virtsize, float vstyle, float alpha)
{
	float grp = Hud_GroupForStyle(vstyle);
	if (grp < 0)
		return;

	float count = grp_count[grp];
	float base = grp * 3;

	// Group title
	string title = strcat(grp_names[grp], " [", grp_keys[grp], "]");
	float tlen = strlen(title);
	float title_y = virtsize_y / 2 - 100;
	drawstring([(virtsize_x - tlen * 10) / 2, title_y, 0],
		title, '10 10 0', '1 1 1', alpha, 0);

	// Vehicle thumbnails in a horizontal row
	float thumb_sz = 64;
	float sel_sz = 96;
	float gap = 20;

	// Calculate total row width
	float row_w = 0;
	float i;
	for (i = 0; i < count; i++)
	{
		float s = grp_members[base + i];
		if (s == vstyle)
			row_w = row_w + sel_sz;
		else
			row_w = row_w + thumb_sz;
		if (i < count - 1)
			row_w = row_w + gap;
	}

	float cx = (virtsize_x - row_w) / 2;
	float thumb_y = title_y + 28;

	for (i = 0; i < count; i++)
	{
		float s = grp_members[base + i];
		float idx = s - 1;
		float is_sel = (s == vstyle);
		float sz;
		float y_off;
		vector color;
		float a;

		if (is_sel)
		{
			sz = sel_sz;
			y_off = 0;
			color = '1 1 1';
			a = alpha;
		}
		else
		{
			sz = thumb_sz;
			y_off = (sel_sz - thumb_sz) / 2;
			color = '0.5 0.5 0.5';
			a = alpha * 0.5;
		}

		// Selection border
		if (is_sel)
			drawfill([cx - 2, thumb_y + y_off - 2, 0], [sz + 4, sz + 4, 0],
				'1 1 0', alpha * 0.4, 0);

		// Vehicle image
		if (idx >= 0 && idx < NUM_VEHICLES)
			drawpic([cx, thumb_y + y_off, 0], veh_pics[idx],
				[sz, sz, 0], color, a, 0);

		// Small name label under thumbnail
		if (idx >= 0 && idx < NUM_VEHICLES)
		{
			float nlen = strlen(veh_names[idx]);
			float lsz = 6;
			drawstring([cx + (sz - nlen * lsz) / 2, thumb_y + sel_sz + 6, 0],
				veh_names[idx], [lsz, lsz, 0], color, a, 0);
		}

		cx = cx + sz + gap;
	}

	// Selected vehicle name (larger)
	float sel_idx = vstyle - 1;
	float name_y = thumb_y + sel_sz + 22;
	if (sel_idx >= 0 && sel_idx < NUM_VEHICLES)
	{
		float snlen = strlen(veh_names[sel_idx]);
		drawstring([(virtsize_x - snlen * 12) / 2, name_y, 0],
			veh_names[sel_idx], '12 12 0', '1 1 1', alpha, 0);
	}

	// Cycle hint
	if (count > 1)
	{
		string chint = strcat("Press ", grp_keys[grp], " again to cycle");
		float chlen = strlen(chint);
		drawstring([(virtsize_x - chlen * 8) / 2, name_y + 18, 0],
			chint, '8 8 0', '0.7 0.7 0.7', alpha * 0.8, 0);
	}

	// Fire hint
	string hint = "Press FIRE to start";
	float hlen = strlen(hint);
	float hint_y = name_y + 18;
	if (count > 1)
		hint_y = hint_y + 14;
	drawstring([(virtsize_x - hlen * 8) / 2, hint_y, 0],
		hint, '8 8 0', '0.7 0.7 0.7', alpha * 0.8, 0);
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

// "DANGER" banner under the compass. Shown while the player is above
// stealth altitude (>2 pips off the ground). White by default; red when
// a radar currently has lock. Server packs this into STAT_HUD_DANGER:
// 0=hidden, 1=white, 2=red.
static void Hud_DrawDanger(vector virtsize)
{
	float st = getstatf(STAT_HUD_DANGER);
	if (st < 1) return;

	string label = "DANGER";
	vector sz = '14 14 0';
	float w = strlen(label) * sz_x;
	float x = (virtsize_x - w) / 2;
	float y = 56;

	vector col;
	if (st >= 2) col = '1 0.15 0.15';  // red — radar lock
	else         col = '1 1 1';        // white — exposed but no lock

	// 1px black drop shadow for legibility over any background.
	drawstring([x + 1, y + 1, 0], label, sz, '0 0 0', 0.7, 0);
	drawstring([x, y, 0], label, sz, col, 1, 0);
};

// "RADAR" banner under DANGER, only when a radar currently has lock
// (hud_danger==2). Flashes white↔red on a ~3Hz cycle so it reads as a
// separate, more urgent alert than the static DANGER label above.
static void Hud_DrawRadar(vector virtsize)
{
	if (getstatf(STAT_HUD_DANGER) < 2) return;

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
//      o   ← cabeza
//     /|\  ← brazos abiertos
//     / \  ← piernas separadas
// ---------------------------------------------------------------------
static void Hud_DrawPax(vector vsz, float pax_count, float pax_alpha)
{
	if (pax_alpha <= 0)
		return;
	float cap = 8;
	float ch = 8;
	float fig_w = ch * 3;
	float fig_gap = 4;
	float row_h = ch;
	float base_x = 6;
	// Bottom row of figures sits a bit above the screen edge.
	float base_y = vsz_y - row_h * 3 - 8;

	float i;
	for (i = 0; i < cap; i++)
	{
		float fx = base_x + i * (fig_w + fig_gap);
		vector col;
		if (i < pax_count)
			col = '0.5 0.85 1';   // llenos — azul claro
		else
			col = '0.4 0.4 0.4';  // huecos — gris
		// Cabeza centrada en la columna del medio (offset +ch para
		// quedar en la columna central).
		drawstring([fx + ch, base_y, 0],     "o",   '8 8 0', col, pax_alpha, 0);
		drawstring([fx, base_y + row_h, 0],  "/|\\", '8 8 0', col, pax_alpha, 0);
		drawstring([fx, base_y + row_h*2,0], "/ \\", '8 8 0', col, pax_alpha, 0);
	}
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

	if (health < 0) health = 0;
	if (ammo < 0 || ammo > 1000) ammo = 0;

	Hud_DrawCompass(virtsize);
	Hud_DrawDanger(virtsize);
	Hud_DrawRadar(virtsize);
	Hud_DrawMission(virtsize);

	// Health bar (left edge, vertical) - only in vehicle.
	if (health > 0 && wepmdl)
	{
		float bar_w = 16;
		float bar_h = 120;
		float border = 2;
		float bar_x = 6;
		float bar_y = virtsize_y - bar_h - 6;
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
		float ammo_x = 100;

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

		float ammo_y = virtsize_y - num_rows * (ammo_h + ammo_row_gap) - 6;

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

	// Weapon image (bottom-right corner, flush).
	if (wepmdl && wepid >= 0 && wepid < NUM_WEAPONS)
	{
		vector picsize = [66 * 2, 34 * 2, 0];
		vector picpos = [virtsize_x - picsize_x - 6, virtsize_y - picsize_y - 6, 0];
		drawpic(picpos, wep_pics[wepid], picsize, '1 1 1', 0.9, 0);
	}

	// Missile view indicator (bottom center).
	if (getstatf(STAT_HUD_MISSVIEW))
	{
		string mvtxt = "[ MISSILE VIEW ]";
		float mvlen = strlen(mvtxt) * 8;
		drawstring([virtsize_x / 2 - mvlen / 2, virtsize_y - 16, 0], mvtxt, '8 8 0', '1 0.3 0.3', 1, 0);
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
		float delay = 2;     // seconds before showing selection
		float fadein = 1.5;  // seconds for fade in
		float elapsed = time - death_time;

		if (elapsed > delay && vstyle >= 1 && vstyle <= NUM_VEHICLES)
		{
			float alpha = (elapsed - delay) / fadein;
			if (alpha > 1) alpha = 1;
			Hud_DrawVehicleSelect(virtsize, vstyle, alpha);
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
		Hud_DrawNewscast(virtsize_x, virtsize_y, visible_phase);
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

void(vector virtsize, float showscores) CSQC_DrawHud =
{
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
