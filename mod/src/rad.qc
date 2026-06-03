//Decompiled code. Please respect the original copyright.
void() rad_run;
void() rad_aim;
void() start_monster_rad;
void() rad_assign;

float() RadFindTarget =
{
	local entity e;
	local entity client;
	local entity e2;
	local float r;
	local float mr;
	local string teststr;
	local string dirstr;

	if ((self.ts == T0))
	{
		teststr = T1;
	}
	else
	{
		if ((self.ts == T1))
		{
			if (deathmatch)
			{
				teststr = T2;
			}
			else
			{
				teststr = T0;
			}
		}
		else
		{
			teststr = T1;
		}
	}
	mr = 3000;
	if ((self.enemy.health > 0))
	{
		mr = vlen((self.enemy.origin - self.origin));
	}
	e = findradius(self.origin, 3000);
	self.impulse = 0;
	while (e)
	{
		if ((e.ts == teststr))
		{
			if (((e.takedamage == DAMAGE_AIM) && (e.solid != SOLID_BSP)))
			{
				if (((e.health > 0) && (e.classname != "player")))
				{
					if (((e.model == "progs/plane3.mdl") && (e.unstealth_finished > time)))
					{
						self.impulse = self.impulse;
					}
					else
					{
						if ((((e.model == "progs/humba.mdl") && (e.owner.attack_finished < time)) && (e.owner.style == 9)))
						{
							self.impulse = self.impulse;
						}
						else
						{
							// Low-altitude stealth: target hugging the ground
							// (<=SIGILO_MAX_ALT above whatever is below it,
							// water included) is invisible to radar.
							// Matches gameplay.md "volar bajo" rule.
							if ((Stars_EntAltOverGround(e) <= SIGILO_MAX_ALT))
							{
								self.impulse = self.impulse;
							}
							else
							{
							if (visible(e))
							{
								self.impulse = (self.impulse + 1);
								r = vlen((e.origin - self.origin));
								if ((r < mr))
								{
									mr = r;
									self.enemy = e;
								}
								if ((e.rad_time < time))
								{
									sound(self, CHAN_VOICE, "speech/rw_a_al.wav", 1, ATTN_NORM);
									send_voicemsg(84, self);
									teamprint(self, self.netname);
									teamprint(self, ": Enemy ");
									if ((e.owner.classname == "player"))
									{
										if ((e.owner.style == 1))
										{
											teamprint(self, "Dogfighter (");
										}
										else
										{
											if ((e.owner.style == 2))
											{
												teamprint(self, "Fighter Bomber (");
											}
											else
											{
												if ((e.owner.style == 3))
												{
													teamprint(self, "Stealth Fighter (");
												}
												else
												{
													if ((e.owner.style == 4))
													{
														teamprint(self, "Bomber (");
													}
													else
													{
														if ((e.owner.style == 5))
														{
															teamprint(self, "X-29 (");
														}
														else
														{
															if ((e.owner.style == 6))
															{
																teamprint(self, "Helicopter (");
															}
															else
															{
																teamprint(self, "Ground vehicle (");
															}
														}
													}
												}
											}
										}
									}
									else
									{
										teamprint(self, "vehicle (");
									}
									teamprint(self, e.netname);
									teamprint(self, ") in ");
									v_forward = vectoangles((e.origin - self.origin));
									r = v_forward_y;
									if (((r > 67) && (r <= 112)))
									{
										dirstr = "north";
									}
									else
									{
										if (((r > 22) && (r <= 67)))
										{
											dirstr = "northeast";
										}
										else
										{
											if (((r > 337) || (r <= 22)))
											{
												dirstr = "east";
											}
											else
											{
												if (((r > 292) && (r <= 337)))
												{
													dirstr = "southeast";
												}
												else
												{
													if (((r > 247) && (r <= 292)))
													{
														dirstr = "south";
													}
													else
													{
														if (((r > 202) && (r <= 247)))
														{
															dirstr = "southwest";
														}
														else
														{
															if (((r > 157) && (r <= 202)))
															{
																dirstr = "west";
															}
															else
															{
																if (((r > 112) && (r <= 157)))
																{
																	dirstr = "northwest";
																}
															}
														}
													}
												}
											}
										}
									}
									teamprint(self, dirstr);
									if (((e.origin_z - self.origin_z) > 1000))
									{
										teamprint(self, " high");
									}
									else
									{
										if (((e.origin_z - self.origin_z) < 100))
										{
											teamprint(self, " low");
										}
									}
									teamprint(self, "\n");
								}
								e.rad_time = (time + 3);
							}
							}
						}
					}
				}
			}
		}
		e = e.chain;
	}
	return (TRUE);
};

void() rad_stand = [ 0, rad_stand ]
{
	local entity e;
	local float n;

	checkground();
	if (!(self.flags & FL_ONGROUND))
	{
		T_Damage(self, world, world, 1000);
	}
	if ((self.rad_time < time))
	{
		RadFindTarget();
		self.rad_time = (time + 1);
	}
	if ((self.enemy != world))
	{
		n = vlen((self.origin - self.enemy.origin));
		if ((n > 3000))
		{
			self.enemy = world;
		}
		if (!visible(self.enemy))
		{
			self.enemy = world;
		}
		if ((self.enemy.health < 1))
		{
			self.enemy = world;
		}
		if (((self.enemy.model == "progs/plane3.mdl") && (self.enemy.unstealth_finished < time)))
		{
			if ((random() < 0.2))
			{
				self.enemy = world;
			}
		}
		// Low-altitude stealth: drop the lock if the target is hugging
		// the ground (<=SIGILO_MAX_ALT, water included). Same rule as
		// in RadFindTarget — without this, a target acquired up high
		// keeps beeping after descending into stealth altitude.
		if ((self.enemy != world))
		{
			if ((Stars_EntAltOverGround(self.enemy) <= SIGILO_MAX_ALT))
			{
				self.enemy = world;
			}
		}
	}
	if (((self.enemy != world) && (self.attack_finished < time)))
	{
		if (visible(self.enemy))
		{
			if ((self.enemy.owner.classname == "player"))
			{
				if ((self.enemy.owner.rad_time < time))
				{
					stuffcmd(self.enemy.owner, "play in2.wav\n");
				}
				self.enemy.owner.armortype = (self.enemy.owner.armortype | 1);
				self.enemy.owner.radar_locked_until = (time + 1.5);
			}
			self.attack_finished = (time + 1);
			rad_assign();
		}
	}
	rad_aim();
};

void() rad_walk = [ 0, rad_stand ]
{
};

void() rad_run = [ 0, rad_stand ]
{
};

// Wreckage smoke FX for a destroyed radar.
//
// Design notes (took two passes to get right — see history if curious):
//
//   - Sprites: dedicated rsmoke[1-5].spr family. Bigger (48×48) than
//     puff_g, dark warm-grey, holds its silhouette while a heavy blue-
//     noise dither eats it away. Real smoke doesn't shrink as it
//     dissipates; it thins. The sprite encodes that.
//
//   - Source: the emitter sits at ground level (the radar's origin) and
//     spawns every puff RIGHT THERE. The column forms naturally because
//     older puffs have had time to rise. We do NOT spawn at random Z up
//     in the air — that's what made the first version look wrong (the
//     column appeared fully-formed instantly).
//
//   - Per-puff motion: each puff gets its own rise speed + lateral
//     drift at birth. Slow puffs cluster low, fast puffs reach high —
//     the column has natural density variation.
//
//   - Animation: each puff picks a random delay (~0.4-1.4s) BEFORE
//     advancing to the next frame. No two puffs are in sync, so the
//     column doesn't pulse.
//
//   - Dissolve: the emitter stops after RAD_SMOKE_DURATION seconds; the
//     already-spawned puffs keep animating their dither-fade out for
//     another ~12s on top, giving an organic tail.

float RAD_SMOKE_DURATION   = 6;     // seconds of active emission
float RAD_SMOKE_INTERVAL   = 0.18;  // seconds between emissions (mean)
float RAD_SMOKE_SPAWN_R    = 6;     // ground-level scatter radius (tight)
float RAD_SMOKE_RISE_MIN   = 28;    // vertical velocity range
float RAD_SMOKE_RISE_MAX   = 70;
float RAD_SMOKE_DRIFT      = 5;     // lateral wander (small — keep cohesive)
float RAD_SMOKE_FRAME_MIN  = 0.4;   // per-frame delay range
float RAD_SMOKE_FRAME_MAX  = 1.4;
float RAD_SMOKE_NFRAMES    = 24;

// One animation step for a single wreckage puff. Pulls its own random
// next-frame delay so it stays visually desynced from peers. Damps
// horizontal velocity each tick — vertical keeps lifting (no gravity
// for these; they're nonsolid sprites with MOVETYPE_NOCLIP).
void() rad_smoke_puff_advance =
{
	self.frame = (self.frame + 1);
	if ((self.frame >= (RAD_SMOKE_NFRAMES - 1)))
	{
		remove(self);
		return;
	}
	self.velocity_x = (self.velocity_x * 0.85);
	self.velocity_y = (self.velocity_y * 0.85);
	self.think = rad_smoke_puff_advance;
	self.nextthink = (time + RAD_SMOKE_FRAME_MIN
		+ (random() * (RAD_SMOKE_FRAME_MAX - RAD_SMOKE_FRAME_MIN)));
};

// Spawn one wreckage puff at `where` with a random rsmoke[1-5] sprite,
// upward velocity in the rise range, and small lateral drift.
void(vector where) rad_smoke_spawn_puff =
{
	local entity e;
	local float pick;

	e = spawn();
	pick = floor(random() * 5);
	if ((pick < 1))
	{
		setmodel(e, "progs/rsmoke.spr");
	}
	else if ((pick < 2))
	{
		setmodel(e, "progs/rsmoke2.spr");
	}
	else if ((pick < 3))
	{
		setmodel(e, "progs/rsmoke3.spr");
	}
	else if ((pick < 4))
	{
		setmodel(e, "progs/rsmoke4.spr");
	}
	else
	{
		setmodel(e, "progs/rsmoke5.spr");
	}
	setorigin(e, where);
	e.movetype = MOVETYPE_NOCLIP;
	e.solid = SOLID_NOT;
	e.classname = "rad_smoke_puff";
	// Start at frame 0 — the sprite itself encodes the grow-in.
	e.frame = 0;
	e.velocity_x = ((random() - 0.5) * RAD_SMOKE_DRIFT * 2);
	e.velocity_y = ((random() - 0.5) * RAD_SMOKE_DRIFT * 2);
	e.velocity_z = RAD_SMOKE_RISE_MIN
		+ (random() * (RAD_SMOKE_RISE_MAX - RAD_SMOKE_RISE_MIN));
	e.think = rad_smoke_puff_advance;
	e.nextthink = (time + RAD_SMOKE_FRAME_MIN
		+ (random() * (RAD_SMOKE_FRAME_MAX - RAD_SMOKE_FRAME_MIN)));
};

// Emitter think: drops a puff at the radar's death position with a small
// horizontal jitter, then schedules the next emission. Removes itself
// once attack_finished elapses.
void() rad_smoke_think =
{
	local vector puffpos;
	local float ang;
	local float rad;

	if ((time >= self.attack_finished))
	{
		remove(self);
		return;
	}

	// Emit at GROUND LEVEL. The column grows because previous puffs
	// have risen — we never spawn high up.
	ang = (random() * 360);
	rad = (random() * RAD_SMOKE_SPAWN_R);
	makevectors(ang * '0 1 0');
	puffpos = self.origin + (v_forward * rad);
	puffpos_z = self.origin_z - 10;  // 10u below the radar pos
	rad_smoke_spawn_puff(puffpos);

	// Jitter the emission interval too, so puffs don't queue up at a
	// regular rhythm.
	self.nextthink = (time + RAD_SMOKE_INTERVAL * (0.7 + random() * 0.6));
	self.think = rad_smoke_think;
};

void() rad_death =
{
	local entity smoker;

	// Flash explosion at the radar's position. We do NOT touch the base
	// (self.trigger_field, progs/radpl.mdl) — the wreckage should keep
	// it sitting there as a destroyed-radar prop. Previously this called
	// BecomeExplosion on the trigger_field, which swapped its model to
	// the explosion sprite and then SUB_Remove'd it.
	WriteByte(MSG_BROADCAST, SVC_TEMPENTITY);
	WriteByte(MSG_BROADCAST, TE_EXPLOSION);
	WriteCoord(MSG_BROADCAST, self.origin_x);
	WriteCoord(MSG_BROADCAST, self.origin_y);
	WriteCoord(MSG_BROADCAST, self.origin_z);
	// Make the base inert: visible but not interactive.
	self.trigger_field.takedamage = 0;
	self.trigger_field.solid = SOLID_NOT;

	// Persistent column emitter. Independent entity because the radar
	// itself may be removed (singleplayer) or kept around invisible to
	// respawn later (deathmatch).
	smoker = spawn();
	smoker.classname = "rad_smoke_emitter";
	smoker.movetype = MOVETYPE_NONE;
	smoker.solid = SOLID_NOT;
	setorigin(smoker, self.origin);
	smoker.attack_finished = (time + RAD_SMOKE_DURATION);
	smoker.think = rad_smoke_think;
	smoker.nextthink = (time + 0.1);

	if (!deathmatch)
	{
		remove(self);
	}
	else
	{
		// Hide the rotating-antenna body (self / progs/radba.mdl) while
		// waiting to respawn. setmodel(self, "") alone doesn't always
		// blank the renderer on every engine — clearing modelindex
		// explicitly is the belt-and-braces fix. The base stays visible.
		setmodel(self, "");
		self.modelindex = 0;
		self.solid = SOLID_NOT;
		self.takedamage = 0;
		self.think = start_monster_rad;
		self.nextthink = (time + self.wait);
	}
};

void() rad_die =
{
	if ((self.health < -90))
	{
		sound(self, CHAN_VOICE, "player/udeath.wav", 1, ATTN_NORM);
		Throw_ACgib();
		Throw_ACgib();
		Throw_ACgib();
	}
	self.solid = SOLID_NOT;
	rad_death();
};

void() rad_aim =
{
	local vector dir;
	local vector vtemp;
	local vector org;
	local vector vel;
	local float dist;

	dir = ((self.angles_y * '0 1 0') + '-30 10 0');
	makevectors(dir);
	org = (self.origin + v_forward);
	dir = vectoangles((org - self.origin));
	vtemp = '0 0 0';
	vtemp_y = (dir_y - self.angles_y);
	vtemp_x = (dir_x - self.trigger_field.angles_x);
	dir = '0 0 0';
	if ((vtemp_x < 0))
	{
		vtemp_x = (vtemp_x + 360);
	}
	if ((vtemp_x > 180))
	{
		vtemp_x = (vtemp_x - 360);
	}
	if ((vtemp_y < 0))
	{
		vtemp_y = (vtemp_y + 360);
	}
	if ((vtemp_y > 180))
	{
		vtemp_y = (vtemp_y - 360);
	}
	dir = vtemp;
	if ((dir_x < -10))
	{
		dir_x = -10;
	}
	if ((dir_x > 10))
	{
		dir_x = 10;
	}
	if ((dir_y < -10))
	{
		dir_y = -10;
	}
	if ((dir_y > 10))
	{
		dir_y = 10;
	}
	self.trigger_field.angles_x = anglemod((self.trigger_field.angles_x + dir_x));
	self.angles_y = anglemod((self.angles_y + dir_y));
	self.trigger_field.angles_y = self.angles_y;
};

void() rad_assign =
{
	local entity e;
	local entity temp;
	local float mr;
	local float r;

	stemp = self;
	temp = self.enemy;
	e = find(world, ts, self.ts);
	while (e)
	{
		if ((e.health > 0))
		{
			if (((e.classname == "monster_sam") || (e.classname == "monster_aag")))
			{
				if (e.th_run)
				{
					if ((e.enemy.pdmg > (e.enemy.health * 1.5)))
					{
						e.enemy = world;
					}
					mr = 3000;
					if (e.enemy)
					{
						mr = vlen((e.enemy.origin - e.origin));
					}
					r = vlen((stemp.enemy.origin - e.origin));
					if (((r < mr) && (temp.pdmg < (temp.health * 1.5))))
					{
						mr = r;
						traceline(e.origin, self.enemy.origin, TRUE, world);
						if ((trace_fraction == 1))
						{
							self = e;
							self.enemy = temp;
							self.think = self.th_run;
							self.nextthink = (time + 0.1);
						}
					}
				}
			}
		}
		e = find(e, ts, self.ts);
	}
	self = stemp;
};

void() start_monster_rad =
{
	teamplay = cvar("teamplay");
	if ((deathmatch > 0))
	{
		if (((self.team == 0) || (teamplay == 0)))
		{
			remove(self);
			return;
		}
	}
	self.solid = SOLID_SLIDEBOX;
	self.movetype = MOVETYPE_TOSS;
	self.health = self.max_health;
	setmodel(self, "progs/radba.mdl");
	setsize(self, '-16 -16 -24', '16 16 16');
	self.th_stand = rad_stand;
	self.th_walk = rad_walk;
	self.th_run = rad_run;
	self.th_die = rad_die;
	self.th_missile = rad_assign;
	if (!self.netname)
	{
		self.netname = "Radar";
	}
	setorigin(self, self.oldorigin);
	droptofloor();
	self.takedamage = DAMAGE_AIM;
	self.ideal_yaw = (self.angles * '0 1 0');
	self.view_ofs = '0 0 1';
	self.use = monster_use;
	if (((deathmatch > 0) || (self.team != 1)))
	{
		self.flags = (self.flags | FL_MONSTER);
	}
	// Respawning: rad_death now KEEPS the previous base as a wreckage
	// prop. Remove the old one before spawning the fresh base so we
	// don't pile up identical pl-models at the same spot every cycle.
	if (self.trigger_field)
	{
		remove(self.trigger_field);
	}
	stemp = spawn();
	stemp.owner = self;
	stemp.takedamage = DAMAGE_NO;
	setmodel(stemp, "progs/radpl.mdl");
	self.trigger_field = stemp;
	stemp.angles = self.angles;
	setorigin(stemp, self.origin);
	self.th_stand();
};

void() monster_rad =
{
	local vector v1;

	precache_model("progs/radba.mdl");
	precache_model("progs/radpl.mdl");
	// Wreckage smoke column sprites (rad_death / rad_smoke_spawn_puff).
	precache_model("progs/rsmoke.spr");
	precache_model("progs/rsmoke2.spr");
	precache_model("progs/rsmoke3.spr");
	precache_model("progs/rsmoke4.spr");
	precache_model("progs/rsmoke5.spr");
	if (((deathmatch == 0) && (self.team != 1)))
	{
		total_monsters = (total_monsters + 1);
	}
	self.oldorigin = self.origin;
	if (!self.health)
	{
		self.health = 100;
	}
	self.max_health = self.health;
	v1 = ((self.angles_y * '0 1 0') + '-30 0 0');
	makevectors(v1);
	self.movedir = v_forward;
	setup_teament();
	if (!self.wait)
	{
		self.wait = 120;
	}
	self.think = start_monster_rad;
	self.nextthink = ((time + 0.1) + (random() * 0.3));
};
