//Decompiled code. Please respect the original copyright.

void() info_null =
{
	remove(self);
};

void() info_sky =
{
	sky_z = self.origin_z;
};

void() info_mins =
{
	minims = self.origin;
};

void() info_maxs =
{
	maxims = self.origin;
};

void() info_notnull =
{
};
float START_OFF    = 1;

void() light_use =
{
	if ((self.spawnflags & START_OFF))
	{
		lightstyle(self.style, "m");
		self.spawnflags = (self.spawnflags - START_OFF);
	}
	else
	{
		lightstyle(self.style, "a");
		self.spawnflags = (self.spawnflags + START_OFF);
	}
};

void() light =
{
	if (!self.targetname)
	{
		remove(self);
		return;
	}
	if ((self.style >= 32))
	{
		self.use = light_use;
		if ((self.spawnflags & START_OFF))
		{
			lightstyle(self.style, "a");
		}
		else
		{
			lightstyle(self.style, "m");
		}
	}
};

void() light_fluoro =
{
	if ((self.style >= 32))
	{
		self.use = light_use;
		if ((self.spawnflags & START_OFF))
		{
			lightstyle(self.style, "a");
		}
		else
		{
			lightstyle(self.style, "m");
		}
	}
	precache_sound("ambience/fl_hum1.wav");
	ambientsound(self.origin, "ambience/fl_hum1.wav", 0.5, ATTN_STATIC);
};

void() light_fluorospark =
{
	if (!self.style)
	{
		self.style = 10;
	}
	precache_sound("ambience/buzz1.wav");
	ambientsound(self.origin, "ambience/buzz1.wav", 0.5, ATTN_STATIC);
};

void() light_globe =
{
	precache_model("progs/s_light.spr");
	setmodel(self, "progs/s_light.spr");
	makestatic(self);
};

void() light_street =
{
	precache_model("progs/lamp.mdl");
	setmodel(self, "progs/lamp.mdl");
	self.solid = SOLID_BBOX;
	if (!(self.spawnflags & 16))
	{
		setsize(self, '-8 -8 -64', '8 8 8');
	}
	else
	{
		makestatic(self);
	}
};

void() FireAmbient =
{
	precache_sound("ambience/fire1.wav");
	ambientsound(self.origin, "ambience/fire1.wav", 0.5, ATTN_STATIC);
};

void() light_torch_small_walltorch =
{
	precache_model("progs/flame.mdl");
	setmodel(self, "progs/flame.mdl");
	FireAmbient();
	makestatic(self);
};

void() light_flame_large_yellow =
{
	precache_model("progs/flame2.mdl");
	setmodel(self, "progs/flame2.mdl");
	self.frame = 1;
	FireAmbient();
	makestatic(self);
};

void() light_flame_small_yellow =
{
	precache_model("progs/flame2.mdl");
	setmodel(self, "progs/flame2.mdl");
	FireAmbient();
	makestatic(self);
};

void() light_flame_small_white =
{
	precache_model("progs/flame2.mdl");
	setmodel(self, "progs/flame2.mdl");
	FireAmbient();
	makestatic(self);
};
void() fire_fly;

void() misc_fireball =
{
	precache_model("progs/lavaball.mdl");
	self.classname = "fireball";
	self.nextthink = (time + (random() * 5));
	self.think = fire_fly;
	if (!self.speed)
	{
	}
};

void() fire_fly =
{
	local entity fireball;

	fireball = spawn();
	fireball.solid = SOLID_TRIGGER;
	fireball.movetype = MOVETYPE_TOSS;
	fireball.velocity = '0 0 1000';
	fireball.velocity_x = ((random() * 100) - 50);
	fireball.velocity_y = ((random() * 100) - 50);
	fireball.velocity_z = (self.speed + (random() * 200));
	fireball.classname = "fireball";
	setmodel(fireball, "progs/lavaball.mdl");
	setsize(fireball, '0 0 0', '0 0 0');
	setorigin(fireball, self.origin);
	fireball.nextthink = (time + 5);
	fireball.think = SUB_Remove;
	fireball.touch = fire_touch;
	self.nextthink = ((time + (random() * 5)) + 3);
	self.think = fire_fly;
};

void() fire_touch =
{
	T_Damage(other, self, self, 20);
	remove(self);
};

void() barrel_explode =
{
	self.takedamage = DAMAGE_NO;
	self.classname = "explo_box";
	T_RadiusDamage(self, self, 160, world);
	sound(self, CHAN_VOICE, "weapons/r_exp3.wav", 1, ATTN_NORM);
	particle(self.origin, '0 0 0', 75, 255);
	self.origin_z = (self.origin_z + 32);
	BecomeExplosion();
};

void() misc_explobox =
{
	local float oldz;

	self.solid = SOLID_BBOX;
	self.movetype = MOVETYPE_NONE;
	precache_model("maps/b_explob.bsp");
	setmodel(self, "maps/b_explob.bsp");
	precache_sound("weapons/r_exp3.wav");
	self.health = 20;
	self.th_die = barrel_explode;
	self.takedamage = DAMAGE_AIM;
	self.origin_z = (self.origin_z + 2);
	oldz = self.origin_z;
	droptofloor();
	if (((oldz - self.origin_z) > 250))
	{
		dprint("item fell out of level at ");
		dprint(vtos(self.origin));
		dprint("\n");
		remove(self);
	}
};

void() misc_explobox2 =
{
	local float oldz;

	self.solid = SOLID_BBOX;
	self.movetype = MOVETYPE_NONE;
	precache_model2("maps/b_exbox2.bsp");
	setmodel(self, "maps/b_exbox2.bsp");
	precache_sound("weapons/r_exp3.wav");
	self.health = 20;
	self.th_die = barrel_explode;
	self.takedamage = DAMAGE_AIM;
	self.origin_z = (self.origin_z + 2);
	oldz = self.origin_z;
	droptofloor();
	if (((oldz - self.origin_z) > 250))
	{
		dprint("item fell out of level at ");
		dprint(vtos(self.origin));
		dprint("\n");
		remove(self);
	}
};
float SPAWNFLAG_SUPERSPIKE    = 1;
float SPAWNFLAG_LASER    = 2;

void() spikeshooter_use =
{
	if ((self.spawnflags & SPAWNFLAG_LASER))
	{
		sound(self, CHAN_VOICE, "enforcer/enfire.wav", 1, ATTN_NORM);
		LaunchLaser(self.origin, self.movedir);
	}
	else
	{
		AC_spike(self.origin, self.movedir, world);
		if ((self.spawnflags & SPAWNFLAG_SUPERSPIKE))
		{
			newmis.touch = ACsuperspike_touch;
			newmis.dmg = 50;
			newmis.nextthink = (time + 1);
		}
	}
};

void() shooter_think =
{
	spikeshooter_use();
	self.nextthink = (time + self.wait);
	newmis.velocity = (self.movedir * 500);
};

void() trap_spikeshooter =
{
	SetMovedir();
	self.use = spikeshooter_use;
	if ((self.spawnflags & SPAWNFLAG_LASER))
	{
		precache_model2("progs/laser.mdl");
		precache_sound2("enforcer/enfire.wav");
		precache_sound2("enforcer/enfstop.wav");
	}
	else
	{
		precache_sound("weapons/spike2.wav");
		precache_model("progs/spike.mdl");
	}
};

void() trap_shooter =
{
	trap_spikeshooter();
	if ((self.wait == 0))
	{
		self.wait = 1;
	}
	self.nextthink = ((self.nextthink + self.wait) + self.ltime);
	self.think = shooter_think;
};

void() tmine_boom =
{
	self.origin_z = (self.origin_z + 1);
	T_RadiusDamage(self, self, 200, self);
	WriteByte(MSG_BROADCAST, SVC_TEMPENTITY);
	WriteByte(MSG_BROADCAST, TE_EXPLOSION);
	WriteCoord(MSG_BROADCAST, self.origin_x);
	WriteCoord(MSG_BROADCAST, self.origin_y);
	WriteCoord(MSG_BROADCAST, self.origin_z);
	BecomeExplosion();
};

void() tmine_touch =
{
	if ((other == world))
	{
		return;
	}
	tmine_boom();
};

void() tmine_activated =
{
	traceline((self.origin + '0 0 1'), (self.origin + '0 0 24'), FALSE, self);
	if ((trace_fraction < 1))
	{
		self.think = tmine_boom;
		self.nextthink = 0.1;
		return;
	}
	self.think = tmine_activated;
	self.nextthink = (time + 0.1);
};

void() tmine_start =
{
	setmodel(self, "progs/mine.mdl");
	setsize(self, '-8 -8 -1', '8 8 8');
	self.solid = SOLID_SLIDEBOX;
	self.movetype = MOVETYPE_TOSS;
	self.angles = '0 0 0';
	self.velocity = '0 0 0';
	self.th_die = tmine_boom;
	self.health = 1;
	self.takedamage = DAMAGE_YES;
	self.velocity = '0 0 0';
	droptofloor();
	self.touch = tmine_touch;
	self.think = tmine_activated;
	self.nextthink = (time + 0.1);
};

void() trap_mine =
{
	self.think = tmine_start;
	self.nextthink = (time + 0.3);
};
void() make_bubbles;
void() bubble_remove;

void() air_bubbles =
{
	if (deathmatch)
	{
		remove(self);
		return;
	}
	precache_model("progs/s_bubble.spr");
	self.nextthink = (time + 1);
	self.think = make_bubbles;
};

void() make_bubbles =
{
	local entity bubble;

	bubble = spawn();
	setmodel(bubble, "progs/s_bubble.spr");
	setorigin(bubble, self.origin);
	bubble.movetype = MOVETYPE_NOCLIP;
	bubble.solid = SOLID_NOT;
	bubble.velocity = '0 0 15';
	bubble.nextthink = (time + 0.5);
	bubble.think = bubble_bob;
	bubble.touch = bubble_remove;
	bubble.classname = "bubble";
	bubble.frame = 0;
	bubble.cnt = 0;
	setsize(bubble, '-8 -8 -8', '8 8 8');
	self.nextthink = ((time + random()) + 0.5);
	self.think = make_bubbles;
};

void() bubble_split =
{
	local entity bubble;

	bubble = spawn();
	setmodel(bubble, "progs/s_bubble.spr");
	setorigin(bubble, self.origin);
	bubble.movetype = MOVETYPE_NOCLIP;
	bubble.solid = SOLID_NOT;
	bubble.velocity = self.velocity;
	bubble.nextthink = (time + 0.5);
	bubble.think = bubble_bob;
	bubble.touch = bubble_remove;
	bubble.classname = "bubble";
	bubble.frame = 1;
	bubble.cnt = 10;
	setsize(bubble, '-8 -8 -8', '8 8 8');
	self.frame = 1;
	self.cnt = 10;
	if ((self.waterlevel != 3))
	{
		remove(self);
	}
};

void() bubble_remove =
{
	if ((other.classname == self.classname))
	{
		return;
	}
	remove(self);
};

void() bubble_bob =
{
	local float rnd1;
	local float rnd2;
	local float rnd3;
	local vector vtmp1;
	local vector modi;

	self.cnt = (self.cnt + 1);
	if ((self.cnt == 4))
	{
		bubble_split();
	}
	if ((self.cnt == 20))
	{
		remove(self);
	}
	rnd1 = (self.velocity_x + (-10 + (random() * 20)));
	rnd2 = (self.velocity_y + (-10 + (random() * 20)));
	rnd3 = ((self.velocity_z + 10) + (random() * 10));
	if ((rnd1 > 10))
	{
		rnd1 = 5;
	}
	if ((rnd1 < -10))
	{
		rnd1 = -5;
	}
	if ((rnd2 > 10))
	{
		rnd2 = 5;
	}
	if ((rnd2 < -10))
	{
		rnd2 = -5;
	}
	if ((rnd3 < 10))
	{
		rnd3 = 15;
	}
	if ((rnd3 > 30))
	{
		rnd3 = 25;
	}
	self.velocity_x = rnd1;
	self.velocity_y = rnd2;
	self.velocity_z = rnd3;
	self.nextthink = (time + 0.5);
	self.think = bubble_bob;
};

void() viewthing =
{
	self.movetype = MOVETYPE_NONE;
	self.solid = SOLID_NOT;
	precache_model("progs/player.mdl");
	setmodel(self, "progs/player.mdl");
};

void() func_wall_use =
{
	self.frame = (1 - self.frame);
};

void() func_wall =
{
	self.angles = '0 0 0';
	self.movetype = MOVETYPE_PUSH;
	self.solid = SOLID_BSP;
	self.use = func_wall_use;
	setmodel(self, self.model);
};

void() func_illusionary =
{
	self.angles = '0 0 0';
	self.movetype = MOVETYPE_NONE;
	self.solid = SOLID_NOT;
	setmodel(self, self.model);
	makestatic(self);
};

// Cloud stealth volume. Half-extents of the invisible trigger box around a
// cloud's origin (the visible model spans ~±440 XY, ~±220 Z; we use a bit
// less than the full footprint so the heli has to be properly inside).
vector CLOUD_TRIGGER_MINS = '-360 -360 -170';
vector CLOUD_TRIGGER_MAXS = '360 360 170';

// Touch of a cloud_trigger: refresh the piloting player's "in cloud" timer.
// `other` is whatever entered; the heli bmodel's .owner is the player. We
// give in_cloud_until a small grace (0.25s) so flying between two adjacent
// cloud triggers doesn't flicker out of stealth for a frame.
void() cloud_trigger_touch =
{
	local entity plyr;

	plyr = other.owner;
	if (plyr == world) plyr = other;        // in case the player touches directly
	if (plyr.classname != "player")
		return;

	// First frame entering (was not in a cloud last frame): arm the hide
	// cooldown. While already inside, leave cloud_hide_at untouched so the
	// 1s timer keeps counting toward "effective".
	if (plyr.in_cloud_until < time)
		plyr.cloud_hide_at = (time + CLOUD_HIDE_DELAY);
	plyr.in_cloud_until = (time + 0.25);
};

// Decorative cloud. A point entity placed by the map editor that loads one
// of the offline-baked cloud volumes (maps/b_cloud0..4.bsp, all precached in
// worldspawn) as a NON-SOLID model — the heli flies through it. No alpha.
// The editor scatters these in tight clusters (several very close) so they
// overlap and read as one big lumpy cumulus. Which of the 5 models this
// instance shows is chosen at random right here. "angle" rotates the bmodel.
//
// Stealth: spawns an invisible SOLID_TRIGGER sibling (cloud_trigger) at the
// same spot so the heli can "hide" inside (see stars.qc). The trigger must
// stay a live edict (touch needs it), so only the VISIBLE model is
// makestatic'd — that one never moves/thinks, so we push it to the client
// once and free its server edict (no per-frame cost).
void() cloud =
{
	local float r;
	local entity trig;

	// Invisible stealth trigger sibling — created BEFORE makestatic frees us.
	trig = spawn();
	trig.classname = "cloud_trigger";
	trig.solid = SOLID_TRIGGER;
	trig.movetype = MOVETYPE_NONE;
	setorigin(trig, self.origin);
	setsize(trig, CLOUD_TRIGGER_MINS, CLOUD_TRIGGER_MAXS);
	trig.touch = cloud_trigger_touch;

	r = random();
	if      (r < 0.2) setmodel(self, "maps/b_cloud0.bsp");
	else if (r < 0.4) setmodel(self, "maps/b_cloud1.bsp");
	else if (r < 0.6) setmodel(self, "maps/b_cloud2.bsp");
	else if (r < 0.8) setmodel(self, "maps/b_cloud3.bsp");
	else              setmodel(self, "maps/b_cloud4.bsp");
	self.solid = SOLID_NOT;
	self.movetype = MOVETYPE_NONE;
	makestatic(self);
};

// ---------------------------------------------------------------------
// worldtext — a billboard text label placed in the world. One sprite
// (progs/worldtext.spr) holds one WORD per frame; this entity just picks
// the frame. Generated by modeditor/scripts/gen-text-spr.js from the game
// font (conchars_mod.png). Used to mark spots: EXTRACTION / PICKUP / RETURN.
//
//   "frame"   which word (0=EXTRACTION, 1=PICKUP, 2=RETURN, …). Keep in
//             sync with the WORDS list in gen-text-spr.js.
//   "angle"   ignored (it's a camera-facing billboard).
//
// Non-solid and makestatic'd (pure decoration, no per-frame cost).
void() worldtext =
{
	setmodel(self, "progs/worldtext.spr");
	self.solid = SOLID_NOT;
	self.movetype = MOVETYPE_NONE;
	// self.frame comes straight from the map key "frame" (default 0).
	if (self.frame < 0) self.frame = 0;
	makestatic(self);
};

// counterforces_origin — punto de spawn de unidades Davenport aliadas al
// jugador. El mapper coloca uno o varios; el sistema de contraofensiva elige
// el más cercano al objetivo activo cuando toca desplegar unidades.
// Sin lógica propia de momento: solo registra la posición en el mapa.
void() counterforces_origin =
{
	self.classname = "counterforces_origin";
	self.solid = SOLID_NOT;
	self.movetype = MOVETYPE_NONE;
};

// forces_attack_origin — spawn point for ENEMY ground attack waves (the
// mirror of counterforces_origin). The mapper places one or more; the
// forces-attack system deploys hostile tanks near the one closest to the
// active objective and sends them down the nearest ground path_corner route.
// Marker only; no own logic.
void() forces_attack_origin =
{
	self.classname = "forces_attack_origin";
	self.solid = SOLID_NOT;
	self.movetype = MOVETYPE_NONE;
};

// ---------------------------------------------------------------------
// Props decorativos: aviones aparcados (solo de mirar)
// ---------------------------------------------------------------------
//
// Aviones estáticos para decorar pistas / aparcamientos. NO interactúan: no
// son sólidos, no reciben daño, no tienen lógica. Al iniciar el juego se
// vuelven makestatic (un solo envío al cliente, coste cero por frame).
//
// El mapper los rota con .angles desde el editor. Si no se especifica
// orientación (angles a cero) les damos un yaw diagonal (45°) por defecto, que
// es como "aparcados en diagonal". Reutilizamos los modelos de avión ya
// existentes (plane*.mdl).

// Cuánto subir el avión sobre el punto de suelo trazado para compensar que el
// origen del modelo no está en su base (si no, se entierra). Ajustar a ojo.
float PLANE_GROUND_LIFT = 6;

// Helper: planta el modelo `mdl`, deja el prop inerte y lo congela estático.
void(string mdl) parked_plane_make =
{
	precache_model(mdl);
	setmodel(self, mdl);
	self.solid = SOLID_NOT;
	self.movetype = MOVETYPE_NONE;
	// Diagonal por defecto si el mapper no fijó ninguna orientación.
	if ((self.angles == '0 0 0'))
	{
		self.angles = '0 45 0';
	}
	// Asentar en el suelo: el editor deja el marcador ~64u sobre la superficie
	// y MOVETYPE_NONE no cae, así que el avión quedaría flotando. Trazamos hacia
	// abajo desde un poco por encima del origen y lo pegamos al suelo real.
	// El origen del .mdl no está en su base (queda por debajo del fuselaje), así
	// que sin compensar el avión se entierra: lo subimos PLANE_GROUND_LIFT u.
	traceline(self.origin + '0 0 64', self.origin - '0 0 2048', TRUE, self);
	if ((trace_fraction < 1) && !trace_allsolid)
	{
		setorigin(self, trace_endpos + ('0 0 1' * PLANE_GROUND_LIFT));
	}
	makestatic(self);
};

// prop_plane_a10 — el "A-10" aparcado en diagonal (modelo plane2.mdl).
void() prop_plane_a10 =
{
	parked_plane_make("progs/plane2.mdl");
};

// prop_plane_parked — segundo avión aparcado para variar (modelo plane4.mdl).
void() prop_plane_parked =
{
	parked_plane_make("progs/plane4.mdl");
};

// ---------------------------------------------------------------------
// wave_decor — ola rompiendo en la orilla (decoración estática)
// ---------------------------------------------------------------------
//
// Sprite waveN.spr (SPR_ORIENTED, animado por framegroup → anima solo aunque
// sea makestatic). Se coloca sobre el agua, plano mirando hacia arriba, con el
// AVANCE de la espuma apuntando hacia la tierra. El mapWriter las siembra en
// celdas de agua a 1 cubo de la costa, escribiendo en la clave "angle" el yaw
// geográfico hacia la tierra; aquí fijamos pitch 90 (tumbarlo cara arriba) y
// sumamos WAVE_YAW_OFFSET para alinear el +Y del sprite (la dirección en la
// que la animación avanza) con ese yaw. Ajustar el offset a ojo si el avance
// no apunta a la costa (probar 0 / 90 / 180 / 270).
//
// Hay WAVE_VARIANTS variantes del sprite (wave0..waveN), iguales en la
// rompiente pero con distinta cola de agua quieta → distinto periodo de bucle.
// Cada ola elige una variante de forma DETERMINISTA según su posición (hash de
// origin), de modo que: (a) no cambia entre recompilaciones, y (b) olas
// vecinas usan variantes distintas y no quedan sincronizadas.
float WAVE_YAW_OFFSET = 0;
float WAVE_VARIANTS = 5;   // nº de wave0..wave(N-1).spr generados
void() wave_decor =
{
	local float yaw, idx;
	local string m;

	precache_model("progs/wave0.spr");
	precache_model("progs/wave1.spr");
	precache_model("progs/wave2.spr");
	precache_model("progs/wave3.spr");
	precache_model("progs/wave4.spr");

	// Variante determinista por posición: hash sencillo de las coordenadas
	// (enteras) del origin → [0, WAVE_VARIANTS-1]. Estable entre compilaciones.
	idx = self.origin_x * 3 + self.origin_y * 7 + self.origin_z * 13;
	idx = idx - (floor(idx / WAVE_VARIANTS) * WAVE_VARIANTS);   // idx % WAVE_VARIANTS
	if (idx < 0) idx = idx + WAVE_VARIANTS;
	// Mapeo explícito idx→fichero (más fiable que concatenar con ftos).
	m = "progs/wave0.spr";
	if (idx >= 4)      m = "progs/wave4.spr";
	else if (idx >= 3) m = "progs/wave3.spr";
	else if (idx >= 2) m = "progs/wave2.spr";
	else if (idx >= 1) m = "progs/wave1.spr";
	setmodel(self, m);

	self.solid = SOLID_NOT;
	self.movetype = MOVETYPE_NONE;
	// El motor ya convirtió la clave "angle" del .map en self.angles_y (yaw).
	yaw = (self.angles_y + WAVE_YAW_OFFSET);
	self.angles_x = 90;
	self.angles_y = yaw;
	self.angles_z = 0;
	makestatic(self);
};

void() func_episodegate =
{
	if (!(serverflags & self.spawnflags))
	{
		return;
	}
	self.angles = '0 0 0';
	self.movetype = MOVETYPE_PUSH;
	self.solid = SOLID_BSP;
	self.use = func_wall_use;
	setmodel(self, self.model);
};

void() func_bossgate =
{
	if (((serverflags & 15) == 15))
	{
		return;
	}
	self.angles = '0 0 0';
	self.movetype = MOVETYPE_PUSH;
	self.solid = SOLID_BSP;
	self.use = func_wall_use;
	setmodel(self, self.model);
};

void() ambient_suck_wind =
{
	precache_sound("ambience/suck1.wav");
	ambientsound(self.origin, "ambience/suck1.wav", 1, ATTN_STATIC);
};

void() ambient_drone =
{
	precache_sound("ambience/drone6.wav");
	ambientsound(self.origin, "ambience/drone6.wav", 0.5, ATTN_STATIC);
};

void() ambient_flouro_buzz =
{
	precache_sound("ambience/buzz1.wav");
	ambientsound(self.origin, "ambience/buzz1.wav", 1, ATTN_STATIC);
};

void() ambient_drip =
{
	precache_sound("ambience/drip1.wav");
	ambientsound(self.origin, "ambience/drip1.wav", 0.5, ATTN_STATIC);
};

void() ambient_comp_hum =
{
	precache_sound("ambience/comp1.wav");
	ambientsound(self.origin, "ambience/comp1.wav", 1, ATTN_STATIC);
};

void() ambient_thunder =
{
	precache_sound("ambience/thunder1.wav");
	ambientsound(self.origin, "ambience/thunder1.wav", 0.5, ATTN_STATIC);
};

void() ambient_light_buzz =
{
	precache_sound("ambience/fl_hum1.wav");
	ambientsound(self.origin, "ambience/fl_hum1.wav", 0.5, ATTN_STATIC);
};

void() ambient_swamp1 =
{
	precache_sound("ambience/swamp1.wav");
	ambientsound(self.origin, "ambience/swamp1.wav", 0.5, ATTN_STATIC);
};

void() ambient_swamp2 =
{
	precache_sound("ambience/swamp2.wav");
	ambientsound(self.origin, "ambience/swamp2.wav", 0.5, ATTN_STATIC);
};

void() noise_think =
{
	self.nextthink = (time + 0.5);
	sound(self, 1, "enforcer/enfire.wav", 1, ATTN_NORM);
	sound(self, 2, "enforcer/enfstop.wav", 1, ATTN_NORM);
	sound(self, 3, "enforcer/sight1.wav", 1, ATTN_NORM);
	sound(self, 4, "enforcer/sight2.wav", 1, ATTN_NORM);
	sound(self, 5, "enforcer/sight3.wav", 1, ATTN_NORM);
	sound(self, 6, "enforcer/sight4.wav", 1, ATTN_NORM);
	sound(self, 7, "enforcer/pain1.wav", 1, ATTN_NORM);
};

void() misc_noisemaker =
{
	precache_sound2("enforcer/enfire.wav");
	precache_sound2("enforcer/enfstop.wav");
	precache_sound2("enforcer/sight1.wav");
	precache_sound2("enforcer/sight2.wav");
	precache_sound2("enforcer/sight3.wav");
	precache_sound2("enforcer/sight4.wav");
	precache_sound2("enforcer/pain1.wav");
	precache_sound2("enforcer/pain2.wav");
	precache_sound2("enforcer/death1.wav");
	precache_sound2("enforcer/idle1.wav");
	self.nextthink = ((time + 0.1) + random());
	self.think = noise_think;
};

void() cutcam_think =
{
	local entity e;

	e = find(world, classname, "player");
	while (e)
	{
		if (((e.style < 1) && (e.oldenemy != world)))
		{
			msg_entity = e;
			setorigin(e.oldenemy, self.origin);
			WriteByte(MSG_ONE, 10);
			WriteAngle(MSG_ONE, self.mangle_x);
			WriteAngle(MSG_ONE, self.mangle_y);
			WriteAngle(MSG_ONE, self.mangle_z);
			if (self.message)
			{
				sprint(e, self.message);
			}
		}
		e = find(e, classname, "player");
	}
	remove(self);
};

void() info_cutcam =
{
	if (deathmatch)
	{
		remove(self);
		return;
	}
	if (!self.wait)
	{
		self.wait = 0.3;
	}
	self.think = cutcam_think;
	self.nextthink = (time + self.wait);
};
