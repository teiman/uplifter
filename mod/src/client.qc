//Decompiled code. Please respect the original copyright.
void() player_pain;
void() player_stand1;
void(vector org) spawn_tfog;
void(vector org, entity death_owner) spawn_tdeath;
float modelindex_eyes;
float modelindex_player;
float intermission_running;
float intermission_exittime;

void() info_intermission =
{
};

void() SetChangeParms =
{
	if ((self.health <= 0))
	{
		SetNewParms();
		return;
	}
	self.items = (self.items - (self.items & (((((IT_KEY1 | IT_KEY2) | IT_INVISIBILITY) | IT_INVULNERABILITY) | IT_SUIT) | IT_QUAD)));
	if ((self.health > 100))
	{
		self.health = 100;
	}
	if ((self.health < 50))
	{
		self.health = 50;
	}
	parm1 = self.items;
	parm2 = self.health;
	parm3 = self.armorvalue;
	parm4 = self.ammo_shells;
	parm5 = self.ammo_nails;
	parm6 = self.ammo_rockets;
	parm7 = self.ammo_cells;
	parm8 = self.weapon;
	parm9 = (self.armortype * 100);
};

void() SetNewParms =
{
	parm1 = (((IT_WEP1 | IT_WEP2) | IT_WEP3) | IT_WEP4);
	parm2 = 100;
	parm3 = 0;
	parm4 = 0;
	parm5 = 0;
	parm6 = 0;
	parm7 = 0;
	parm8 = IT_WEP1;
	parm9 = 0;
};

void() DecodeLevelParms =
{
	self.items = (((IT_WEP1 + IT_WEP2) + IT_WEP3) + IT_WEP4);
	self.health = 100;
	self.armorvalue = 0;
	self.ammo_shells = 0;
	self.ammo_nails = 0;
	self.ammo_rockets = 0;
	self.ammo_cells = 0;
	self.weapon = IT_WEP1;
	self.armortype = 0;
};

entity() FindIntermission =
{
	local entity spot;
	local float cyc;

	spot = find(world, classname, "info_intermission");
	if (spot)
	{
		cyc = (random() * 4);
		while ((cyc > 1))
		{
			spot = find(spot, classname, "info_intermission");
			if (!spot)
			{
				spot = find(spot, classname, "info_intermission");
			}
			cyc = (cyc - 1);
		}
		return (spot);
	}
	spot = find(world, classname, "info_player_start");
	if (spot)
	{
		return (spot);
	}
	spot = find(world, classname, "testplayerstart");
	if (spot)
	{
		return (spot);
	}
	objerror("FindIntermission: no spot");
};
string nextmap;

void() GotoNextMap =
{
	local string fs;
	local float f1;

	if (cvar("samelevel"))
	{
		localcmd("restart\n");
	}
	else
	{
		if ((cvar("noexit") == 0))
		{
			changelevel(nextmap);
		}
		else
		{
			serverflags = (serverflags + 1);
			if (((serverflags & 255) >= cvar("noexit")))
			{
				serverflags = (serverflags - (serverflags & 255));
			}
			localcmd("exec map");
			f1 = floor(((serverflags & 255) * 0.1));
			fs = ftos(f1);
			localcmd(fs);
			f1 = ((serverflags & 255) - (f1 * 10));
			fs = ftos(f1);
			localcmd(fs);
			localcmd(".cfg\n");
		}
	}
};

void() ExitIntermission =
{
	if (deathmatch)
	{
		GotoNextMap();
		return;
	}
	intermission_exittime = (time + 1);
	intermission_running = (intermission_running + 1);
	if ((intermission_running == 2))
	{
		if ((world.model == "maps/e1m7.bsp"))
		{
			WriteByte(MSG_ALL, SVC_CDTRACK);
			WriteByte(MSG_ALL, 2);
			WriteByte(MSG_ALL, 3);
			if (!cvar("registered"))
			{
				WriteByte(MSG_ALL, SVC_FINALE);
				WriteString(MSG_ALL, "As the corpse of the monstrous entity\nChthon sinks back into the lava whence\nit rose, you grip the Rune of Earth\nMagic tightly. Now that you have\nconquered the Dimension of the Doomed,\nrealm of Earth Magic, you are ready to\ncomplete your task in the other three\nhaunted lands of Quake. Or are you? If\nyou don't register Quake, you'll never\nknow what awaits you in the Realm of\nBlack Magic, the Netherworld, and the\nElder World!");
			}
			else
			{
				WriteByte(MSG_ALL, SVC_FINALE);
				WriteString(MSG_ALL, "As the corpse of the monstrous entity\nChthon sinks back into the lava whence\nit rose, you grip the Rune of Earth\nMagic tightly. Now that you have\nconquered the Dimension of the Doomed,\nrealm of Earth Magic, you are ready to\ncomplete your task. A Rune of magic\npower lies at the end of each haunted\nland of Quake. Go forth, seek the\ntotality of the four Runes!");
			}
			return;
		}
		else
		{
			if ((world.model == "maps/e2m6.bsp"))
			{
				WriteByte(MSG_ALL, SVC_CDTRACK);
				WriteByte(MSG_ALL, 2);
				WriteByte(MSG_ALL, 3);
				WriteByte(MSG_ALL, SVC_FINALE);
				WriteString(MSG_ALL, "The Rune of Black Magic throbs evilly in\nyour hand and whispers dark thoughts\ninto your brain. You learn the inmost\nlore of the Hell-Mother; Shub-Niggurath!\nYou now know that she is behind all the\nterrible plotting which has led to so\nmuch death and horror. But she is not\ninviolate! Armed with this Rune, you\nrealize that once all four Runes are\ncombined, the gate to Shub-Niggurath's\nPit will open, and you can face the\nWitch-Goddess herself in her frightful\notherworld cathedral.");
				return;
			}
			else
			{
				if ((world.model == "maps/e3m6.bsp"))
				{
					WriteByte(MSG_ALL, SVC_CDTRACK);
					WriteByte(MSG_ALL, 2);
					WriteByte(MSG_ALL, 3);
					WriteByte(MSG_ALL, SVC_FINALE);
					WriteString(MSG_ALL, "The charred viscera of diabolic horrors\nbubble viscously as you seize the Rune\nof Hell Magic. Its heat scorches your\nhand, and its terrible secrets blight\nyour mind. Gathering the shreds of your\ncourage, you shake the devil's shackles\nfrom your soul, and become ever more\nhard and determined to destroy the\nhideous creatures whose mere existence\nthreatens the souls and psyches of all\nthe population of Earth.");
					return;
				}
				else
				{
					if ((world.model == "maps/e4m7.bsp"))
					{
						WriteByte(MSG_ALL, SVC_CDTRACK);
						WriteByte(MSG_ALL, 2);
						WriteByte(MSG_ALL, 3);
						WriteByte(MSG_ALL, SVC_FINALE);
						WriteString(MSG_ALL, "Despite the awful might of the Elder\nWorld, you have achieved the Rune of\nElder Magic, capstone of all types of\narcane wisdom. Beyond good and evil,\nbeyond life and death, the Rune\npulsates, heavy with import. Patient and\npotent, the Elder Being Shub-Niggurath\nweaves her dire plans to clear off all\nlife from the Earth, and bring her own\nfoul offspring to our world! For all the\ndwellers in these nightmare dimensions\nare her descendants! Once all Runes of\nmagic power are united, the energy\nbehind them will blast open the Gateway\nto Shub-Niggurath, and you can travel\nthere to foil the Hell-Mother's plots\nin person.");
						return;
					}
				}
			}
		}
		GotoNextMap();
	}
	if ((intermission_running == 3))
	{
		if (!cvar("registered"))
		{
			WriteByte(MSG_ALL, SVC_SELLSCREEN);
			return;
		}
		if (((serverflags & 15) == 15))
		{
			WriteByte(MSG_ALL, SVC_FINALE);
			WriteString(MSG_ALL, "Now, you have all four Runes. You sense\ntremendous invisible forces moving to\nunseal ancient barriers. Shub-Niggurath\nhad hoped to use the Runes Herself to\nclear off the Earth, but now instead,\nyou will use them to enter her home and\nconfront her as an avatar of avenging\nEarth-life. If you defeat her, you will\nbe remembered forever as the savior of\nthe planet. If she conquers, it will be\nas if you had never been born.");
			return;
		}
	}
	GotoNextMap();
};

void() IntermissionThink =
{
	if ((time < intermission_exittime))
	{
		return;
	}
	if (((!self.button0 && !self.button1) && !self.button2))
	{
		return;
	}
	ExitIntermission();
};

void() execute_changelevel =
{
	local entity pos;

	intermission_running = 1;
	if (deathmatch)
	{
		intermission_exittime = (time + 5);
	}
	else
	{
		intermission_exittime = (time + 2);
	}
	WriteByte(MSG_ALL, SVC_CDTRACK);
	WriteByte(MSG_ALL, 3);
	WriteByte(MSG_ALL, 3);
	pos = FindIntermission();
	other = find(world, classname, "player");
	while ((other != world))
	{
		if (other.enemy)
		{
			remove(other.enemy);
		}
		if (other.oldenemy)
		{
			remove(other.oldenemy);
		}
		if (other.trigger_field)
		{
			remove(other.trigger_field);
		}
		other.enemy = world;
		other.oldenemy = world;
		other.trigger_field = world;
		other.view_ofs = '0 0 0';
		other.v_angle = pos.mangle;
		other.angles = pos.mangle;
		other.fixangle = TRUE;
		other.takedamage = DAMAGE_NO;
		other.solid = SOLID_NOT;
		other.movetype = MOVETYPE_NONE;
		other.modelindex = 0;
		setorigin(other, pos.origin);
		other = find(other, classname, "player");
	}
	WriteByte(MSG_ALL, SVC_INTERMISSION);
};

void() changelevel_touch =
{
	local entity pos;

	if ((other.goalentity.classname != "player"))
	{
		return;
	}
	if ((cvar("samelevel") == 2))
	{
		return;
	}
	if (!deathmatch)
	{
		if ((killedvalues < self.value))
		{
			return;
		}
	}
	if ((coop || deathmatch))
	{
		bprint(other.netname);
		bprint(" exited the level\n");
	}
	nextmap = self.map;
	SUB_UseTargets();
	if (((self.spawnflags & 1) && (deathmatch == 0)))
	{
		GotoNextMap();
		return;
	}
	self.touch = SUB_Null;
	self.think = execute_changelevel;
	self.nextthink = (time + 0.1);
};

void() trigger_changelevel =
{
	if (!self.map)
	{
		objerror("chagnelevel trigger doesn't have map");
	}
	InitTrigger();
	self.touch = changelevel_touch;
};
void() set_suicide_frame;

void() respawn =
{
	if (coop)
	{
		setspawnparms(self);
		PutClientInServer();
	}
	else
	{
		if (deathmatch)
		{
			SetNewParms();
			PutClientInServer();
		}
		else
		{
			if (((self.lives == 1) && (self.health < 3)))
			{
				localcmd("restart\n");
			}
			else
			{
				if ((self.health < 3))
				{
					self.lives = (self.lives - 1);
				}
				setspawnparms(self);
				PutClientInServer();
			}
		}
	}
};

void() ClientKill =
{
	if ((self.enemy.health < 1))
	{
		return;
	}
	if ((self.enemy.owner != self))
	{
		return;
	}
	bprint(self.netname);
	bprint(" suicides\n");
	self.frags = (self.frags - 2);
	T_Damage(self.enemy, self.enemy, self.enemy, 1000);
};

float(vector v) CheckSpawnPoint =
{
	return (FALSE);
};

entity() SelectAirSpawnPoint =
{
	local entity spot;
	local entity e1;
	local entity e2;
	local entity thing;
	local float pcount;
	local float tmp;
	local float f1;
	local float lop;
	local string teststr;
	local string paeae;

	spot = find(world, classname, "testplayerstart");
	if (spot)
	{
		return (spot);
	}
	if (coop)
	{
		teststr = "info_player_coop";
	}
	else
	{
		if (deathmatch)
		{
			teststr = "info_player_deathmatch";
		}
		else
		{
			teststr = "info_player_start";
		}
	}
	if (self.style)
	{
		f1 = calcbit((self.style - 1));
	}
	else
	{
		f1 = 0;
	}
	while (1)
	{
		if (((deathmatch > 0) && (teamplay > 0)))
		{
			tmp = 1;
		}
		else
		{
			tmp = 0;
		}
		if ((lastspawn.classname == teststr))
		{
			e1 = lastspawn;
		}
		else
		{
			e1 = world;
		}
		if (self.style)
		{
			e2 = find(e1, classname, teststr);
			lop = 0;
			while (!lop)
			{
				if ((((e2.sounds & f1) != 0) && ((e2.ts == self.ts) || (tmp == 0))))
				{
					lastspawn = e2;
					return (lastspawn);
				}
				if ((e2 == e1))
				{
					lop = 1;
				}
				e2 = find(e2, classname, teststr);
			}
		}
		e2 = find(e1, classname, teststr);
		lop = 0;
		while (!lop)
		{
			if (((e2 != world) && ((e2.ts == self.ts) || (tmp == 0))))
			{
				lastspawn = e2;
				return (lastspawn);
			}
			if ((e2 == e1))
			{
				lop = 1;
			}
			e2 = find(e2, classname, teststr);
		}
		e2 = find(world, classname, teststr);
		if ((e2 != world))
		{
			lastspawn = e2;
			return (lastspawn);
		}
		dprint("no spot found!\n");
		if ((lastspawn != world))
		{
			return (lastspawn);
		}
		teststr = "info_player_start";
	}
};
void() PlayerDie;

void() PutClientInServer =
{
	local entity spot;

	if (((deathmatch == 0) && (coop == 0)))
	{
		if (!self.lives)
		{
			self.lives = (4 - skill);
		}
	}
	if ((self.health != 3))
	{
		spot = SelectAirSpawnPoint();
	}
	else
	{
		spot = spawn();
		spot.style = calcbit((self.style - 1));
		spot.origin = self.oldorigin;
		spot.angles = self.angles;
		spot.think = SUB_Remove;
		spot.nextthink = (time + 2);
	}
	self.spawnflags = (spot.spawnflags & 3);
	self.classname = "player";
	self.solid = SOLID_NOT;
	self.movetype = 0;
	self.show_hostile = 0;
	self.max_health = 100;
	self.flags = FL_CLIENT;
	self.super_damage_finished = 0;
	self.radsuit_finished = 0;
	self.invisible_finished = 0;
	self.invincible_finished = 0;
	self.effects = 0;
	self.invincible_time = 0;
	self.distance = 100;
	self.speed = 0;
	self.health = 100;
	self.takedamage = DAMAGE_YES;
	DecodeLevelParms();
	stuffcmd(self, "cl_bob 0\n");
	stuffcmd(self, "cl_forwardspeed 1\n");
	stuffcmd(self, "cl_backspeed 1\n");
	stuffcmd(self, "cl_sidespeed 1\n");
	self.attack_finished = time;
	self.th_pain = player_pain;
	self.th_die = PlayerDie;
	self.deadflag = DEAD_NO;
	// Gameplay-mode resets: scrap to safety-net count, stars wiped,
	// passengers gone. Credits (career score) survive death.
	Scrap_OnRespawn();
	self.stars = 0;
	self.pausetime = 0;
	self.impulse = 0;
	// Upgrades persist across deaths (they're session-scoped), but the
	// pending-choice prompt is cleared so the player isn't blocked on
	// respawn.
	self.upgrade_choice_pending = 0;
	self.has_rep = 0;
	self.goalentity = spot;
	self.origin = (spot.origin + '0 0 1');
	self.angles = spot.angles;
	self.fixangle = TRUE;
	setmodel(self, "progs/eyes.mdl");
	modelindex_eyes = self.modelindex;
	setmodel(self, "progs/player.mdl");
	modelindex_player = self.modelindex;
	self.modelindex = 0;
	setsize(self, '0 0 0', '0 0 0');
	self.view_ofs = '0 0 1';
	self.toyview = -1;
	self.lefty = 0;
	if (!self.style)
	{
		// Uplifter: arrancar directamente como heli, sin menú de selección
		self.style = 6;
	}
	if ((!self.ts && !teamplay))
	{
		self.ts = T1;
	}
	if ((deathmatch || coop))
	{
		makevectors(self.angles);
		spawn_tfog((self.origin + (v_forward * 20)));
	}
	// No instructional centerprint here — the intro newscast (intro.qc)
	// handles the player's first impression. After death we just respawn
	// silently.
};

void() info_player_start =
{
};

void() info_player_start2 =
{
};

void() testplayerstart =
{
};

void() info_player_deathmatch =
{
	if (!self.team)
	{
		self.ts = T0;
	}
	else
	{
		if ((self.team == 1))
		{
			self.ts = T1;
		}
		else
		{
			self.ts = T2;
		}
	}
};

void() info_player_coop =
{
};

void() NextLevel =
{
	local entity o;

	if ((mapname == "start"))
	{
		if (!cvar("registered"))
		{
			mapname = "e1m1";
		}
		else
		{
			if (!(serverflags & 1))
			{
				mapname = "e1m1";
				serverflags = (serverflags | 1);
			}
			else
			{
				if (!(serverflags & 2))
				{
					mapname = "e2m1";
					serverflags = (serverflags | 2);
				}
				else
				{
					if (!(serverflags & 4))
					{
						mapname = "e3m1";
						serverflags = (serverflags | 4);
					}
					else
					{
						if (!(serverflags & 8))
						{
							mapname = "e4m1";
							serverflags = (serverflags - 7);
						}
					}
				}
			}
		}
		o = spawn();
		o.map = mapname;
	}
	else
	{
		o = find(world, classname, "trigger_changelevel");
		if (!o)
		{
			mapname = "start";
			o = spawn();
			o.map = mapname;
		}
	}
	if (cvar("samelevel"))
	{
		o.map = mapname;
	}
	nextmap = o.map;
	gameover = TRUE;
	if ((o.nextthink < time))
	{
		o.think = execute_changelevel;
		o.nextthink = (time + 0.1);
	}
};

void() CheckRules =
{
	local float timelimit;
	local float fraglimit;

	if (gameover)
	{
		return;
	}
	timelimit = (cvar("timelimit") * 60);
	fraglimit = cvar("fraglimit");
	if ((timelimit && (time >= timelimit)))
	{
		NextLevel();
		return;
	}
	if ((fraglimit && (self.frags >= fraglimit)))
	{
		NextLevel();
		return;
	}
};

// Vehicle group cycling: pressing the same group key cycles through members
float(float imp) cycle_group_vehicle =
{
	local float s1, s2, s3, count;
	local float cur, start, idx, candidate;

	s1 = 0; s2 = 0; s3 = 0; count = 0;

	if (imp == 1)      { s1 = 1; s2 = 3; s3 = 5; count = 3; }  // Jets
	else if (imp == 2) { s1 = 2; s2 = 4; count = 2; }           // Bombers
	else if (imp == 3) { s1 = 6; s2 = 10; count = 2; }          // Air
	else if (imp == 4) { s1 = 9; count = 1; }                    // Light
	else if (imp == 5) { s1 = 7; s2 = 8; s3 = 11; count = 3; }  // Tanks
	else return 0;

	// Find current position in group, advance to next
	cur = self.style;
	start = 0;

	if (cur == s1) start = 1;
	else if (count > 1 && cur == s2) start = 2;
	else if (count > 2 && cur == s3) start = 0;

	// If current style is not in this group, start from 0
	if (cur != s1 && cur != s2 && cur != s3) start = 0;

	idx = start;
	if (idx >= count) idx = idx - count;

	if (idx == 0) candidate = s1;
	else if (idx == 1) candidate = s2;
	else candidate = s3;

	return candidate;
};

string(float s) vehicle_name =
{
	if (s == 1) return "Dogfighter";
	if (s == 2) return "Fighter Bomber";
	if (s == 3) return "Stealth Fighter";
	if (s == 4) return "A-10";
	if (s == 5) return "X-29";
	if (s == 6) return "Attack Helicopter";
	if (s == 7) return "Mobile SAM";
	if (s == 8) return "Battle Tank";
	if (s == 9) return "Armoured Car";
	if (s == 10) return "Hovercraft";
	if (s == 11) return "P8 Mech";
	return "Unknown";
};

void() PlayerDeathThink =
{
	local entity old_self;
	local entity stemp;
	local entity e;
	local float forward;
	local float tmp;
	local float tmp2;
	local string teststr;

	if ((self.flags & FL_ONGROUND))
	{
		forward = vlen(self.velocity);
		forward = (forward - 20);
		if ((forward <= 0))
		{
			self.velocity = '0 0 0';
		}
		else
		{
			self.velocity = (forward * normalize(self.velocity));
		}
	}
	if ((self.deadflag == DEAD_DEAD))
	{
		if (((self.button2 || self.button1) || self.button0))
		{
			return;
		}
		self.deadflag = DEAD_RESPAWNABLE;
		if ((!deathmatch && !coop))
		{
			if (((self.health < 3) && (self.lives == 1)))
			{
				sprint(self, "Game over. Press special or fire to restart\n");
			}
			return;
		}
		sprint(self, "1:Jets 2:Bombers 3:Air 4:Light 5:Tanks\n");
		sprint(self, "Press again to cycle, fire to start\n");
		if ((self.health < 2))
		{
			self.health = 2;
		}
		self.solid = SOLID_NOT;
		self.oldts = self.ts;
		return;
	}
	if (self.impulse)
	{
		if (self.impulse >= 1 && self.impulse <= 5)
		{
			local float newstyle;
			newstyle = cycle_group_vehicle(self.impulse);
			if (newstyle == 0)
			{
				sprint(self, "Vehicle not available.\n");
			}
			else
			{
				self.style = newstyle;
				sprint(self, vehicle_name(newstyle));
				sprint(self, " selected.\n");
			}
		}
		if ((self.impulse == 15))
		{
			self.skin = (self.skin + 1);
			if ((self.skin == 3))
			{
				self.skin = 0;
			}
			teststr = ftos(self.skin);
			sprint(self, "Skin: ");
			sprint(self, teststr);
			sprint(self, "\n");
		}
		self.impulse = 0;
	}
	if (teamplay)
	{
		if (!self.ts)
		{
			tmp = 0;
			tmp2 = 0;
			e = find(world, classname, "player");
			while (e)
			{
				if ((e.ts == T1))
				{
					tmp = (tmp + 1);
				}
				else
				{
					if ((e.ts == T2))
					{
						tmp2 = (tmp2 + 1);
					}
				}
				e = find(e, classname, "player");
			}
			if ((tmp2 >= tmp))
			{
				self.ts = T1;
				if ((self.team != 3))
				{
					stuffcmd(self, "color 2\n");
				}
				bprint(self.netname);
				bprint(" joined the Blue team\n");
				self.team = 3;
			}
			else
			{
				self.ts = T2;
				if ((self.team != 8))
				{
					stuffcmd(self, "color 7\n");
				}
				bprint(self.netname);
				bprint(" joined the Red team\n");
				self.team = 8;
			}
		}
		if ((((self.oldts == T2) && (self.ts == T2)) && (self.team == 3)))
		{
			bprint(self.netname);
			bprint(" joined the Blue team\n");
			if ((self.team != 3))
			{
				stuffcmd(self, "color 2\n");
			}
			self.ts = T1;
			self.health = 2;
		}
		else
		{
			if ((((self.oldts == T1) && (self.ts == T1)) && (self.team == 8)))
			{
				bprint(self.netname);
				bprint(" joined the Red team\n");
				if ((self.team != 8))
				{
					stuffcmd(self, "color 7\n");
				}
				self.ts = T2;
				self.health = 2;
			}
		}
	}
	if (((!self.button0 && !self.button1) && !self.button2))
	{
		return;
	}
	if ((time < self.pain_finished))
	{
		return;
	}
	self.button0 = 0;
	self.button1 = 0;
	self.button2 = 0;
	respawn();
};

void() PlayerPreThink =
{
	local float mspeed;
	local float aspeed;
	local float r;
	local entity stemp;
	local entity e;
	local string teststr;

	if (intermission_running)
	{
		IntermissionThink();
		return;
	}
	if ((self.view_ofs == '0 0 0'))
	{
		return;
	}
	if (((deathmatch > 0) && (teamplay == 1)))
	{
		if ((self.ts == T2))
		{
			if ((self.team != 8))
			{
				stuffcmd(self, "color 7\n");
			}
		}
		else
		{
			if ((self.team != 3))
			{
				stuffcmd(self, "color 2\n");
			}
		}
	}
	makevectors(self.v_angle);
	CheckRules();
	Stars_DecayTick();
	Stars_HighFlightTick();
	Scrap_HealTick();
	Objectives_HudTick();
	Stealth_HudTick();
	Siphon_Tick();
	if (g_intro_running)
	{
		Intro_TickPlayer();
	}
	if ((self.impulse == 101))
	{
		Upgrades_Pick(1);
		self.impulse = 0;
	}
	if ((self.impulse == 102))
	{
		Upgrades_Pick(0);
		self.impulse = 0;
	}
	// Minimap peek (impulses 120/121 from +minimap/-minimap aliases).
	Minimap_TickPlayer();
	if (((self.style > 0) && (self.style < 6)))
	{
		plane_upright();
	}
	if (((self.impulse == 6) && (self.enemy.owner == self)))
	{
		self.wepv = (self.wepv + 1);
		if ((self.wepv == 3))
		{
			self.wepv = 0;
		}
		self.impulse = 0;
		W_SetCurrentAmmo();
	}
	if ((self.impulse == 106))
	{
		self.speed = -4;
		self.impulse = 0;
	}
	if ((self.impulse == 107))
	{
		self.speed = 4;
		self.impulse = 0;
	}
	if ((self.impulse == 108))
	{
		self.speed = 0;
		self.impulse = 0;
	}
	if ((self.impulse == 20))
	{
		self.oldenemy.style = (self.oldenemy.style + 8);
		if ((self.oldenemy.style > 32))
		{
			self.oldenemy.style = 0;
		}
		self.impulse = 0;
	}
	if ((((self.impulse == 21) && (self.enemy.owner == self)) && (self.style > 6)))
	{
		self.oldenemy.toyview = (1 - self.oldenemy.toyview);
		if ((self.oldenemy.toyview == 1))
		{
			if (!self.enemy.trigger_field)
			{
				sprint(self, "Angle: ");
				e = self.enemy;
				if (e.movetarget)
				{
					e = e.movetarget;
				}
				teststr = ftos(e.toyview);
				sprint(self, teststr);
				sprint(self, "\n");
			}
			else
			{
				self.oldenemy.tur1 = self.enemy.trigger_field;
				sprint(self, "Turret locked\n");
			}
		}
		else
		{
			if (self.oldenemy.tur1)
			{
				self.oldenemy.tur1 = world;
			}
			sprint(self, "Turret unlocked\n");
		}
		self.impulse = 0;
	}
	CheckAdminCmd();
	self.distance = (self.distance + self.speed);
	if ((self.distance < 0))
	{
		self.distance = 0;
		self.speed = 0;
	}
	if ((self.distance > 1000))
	{
		self.distance = 1000;
		self.speed = 0;
	}
	if ((((self.search_time > time) && (self.impulse == 10)) && (self.enemy.owner == self)))
	{
		if (self.enemy.oldenemy)
		{
			remove(self.enemy.oldenemy);
		}
		if (self.enemy.movetarget)
		{
			remove(self.enemy.movetarget);
		}
		if (self.trigger_field)
		{
			remove(self.trigger_field);
		}
		self.movetype = MOVETYPE_NONE;
		self.oldorigin = (self.enemy.origin + '0 0 8');
		setorigin(self, (self.enemy.origin + '0 0 8'));
		setorigin(self.oldenemy, (self.enemy.origin + '0 0 8'));
		remove(self.enemy);
		self.health = 3;
		self.deadflag = DEAD_DEAD;
		self.impulse = 0;
	}
	if ((self.deadflag >= DEAD_DEAD))
	{
		PlayerDeathThink();
		return;
	}
	if ((self.deadflag == DEAD_DYING))
	{
		return;
	}
};

void() CheckPowerups =
{
	if ((self.health <= 0))
	{
		return;
	}
	self.modelindex = 0;
	if (self.invincible_finished)
	{
		if ((self.invincible_finished < (time + 3)))
		{
			if ((self.invincible_time == 1))
			{
				sprint(self, "Protection is almost burned out\n");
				stuffcmd(self, "bf\n");
				sound(self, CHAN_AUTO, "items/protect2.wav", 1, ATTN_NORM);
				self.invincible_time = (time + 1);
			}
			if ((self.invincible_time < time))
			{
				self.invincible_time = (time + 1);
				stuffcmd(self, "bf\n");
			}
		}
		if ((self.invincible_finished < time))
		{
			self.items = (self.items - IT_INVULNERABILITY);
			self.invincible_time = 0;
			self.invincible_finished = 0;
		}
		if ((self.invincible_finished > time))
		{
			self.effects = (self.effects | EF_DIMLIGHT);
		}
		else
		{
			self.effects = (self.effects - (self.effects & EF_DIMLIGHT));
		}
	}
	if (self.super_damage_finished)
	{
		if ((self.super_damage_finished < (time + 3)))
		{
			if ((self.super_time == 1))
			{
				sprint(self, "Quad Damage is wearing off\n");
				stuffcmd(self, "bf\n");
				sound(self, CHAN_AUTO, "items/damage2.wav", 1, ATTN_NORM);
				self.super_time = (time + 1);
			}
			if ((self.super_time < time))
			{
				self.super_time = (time + 1);
				stuffcmd(self, "bf\n");
			}
		}
		if ((self.super_damage_finished < time))
		{
			self.items = (self.items - IT_QUAD);
			self.super_damage_finished = 0;
			self.super_time = 0;
		}
		if ((self.super_damage_finished > time))
		{
			self.effects = (self.effects | EF_DIMLIGHT);
		}
		else
		{
			self.effects = (self.effects - (self.effects & EF_DIMLIGHT));
		}
	}
	if (self.radsuit_finished)
	{
		self.air_finished = (time + 12);
		if ((self.radsuit_finished < (time + 3)))
		{
			if ((self.rad_time == 1))
			{
				sprint(self, "Air supply in Biosuit expiring\n");
				stuffcmd(self, "bf\n");
				sound(self, CHAN_AUTO, "items/suit2.wav", 1, ATTN_NORM);
				self.rad_time = (time + 1);
			}
			if ((self.rad_time < time))
			{
				self.rad_time = (time + 1);
				stuffcmd(self, "bf\n");
			}
		}
		if ((self.radsuit_finished < time))
		{
			self.items = (self.items - IT_SUIT);
			self.rad_time = 0;
			self.radsuit_finished = 0;
		}
	}
};

void() SetCameraPlace =
{
	local entity stemp;
	local float r;
	local vector v1;
	local vector v2;

	if (self.lastmiss)
	{
		if (((self.lastmiss.origin == '0 0 0') || ((self.lastmiss.owner != self) && (self.lastmiss.owner != self.enemy))))
		{
			self.lastmiss = world;
		}
	}

	// MINIMAP PEEK temporalmente desactivado — el cliente del mod no
	// responde a ninguna técnica estándar para mover la cámara
	// (svc_setview, view_ofs, setorigin sobre player/heli/chasecam).
	// El render parece anclado a una posición cacheada del mundo
	// principal.  Dejamos el flag minimap_peeking funcionando para no
	// romper la integración, pero no movemos nada — solo dejamos el
	// resto del HUD como está.  Volveremos al peek cuando tengamos
	// una sesión dedicada para investigar el render path completo.
	if (0 && self.minimap_peeking)
	{
		// EXPERIMENTO: mover EL HELO (self.enemy) al minimap junto con
		// self y oldenemy. La auto-muerte del helo por pointcontents
		// está suprimida durante el peek (helo1.qc).
		//
		// Si esto sigue mostrando el cielo del mundo principal, el
		// problema está en otra parte (quizá el motor está usando una
		// posición cacheada y necesita una señal explícita para
		// reaceptarla).
		local vector mpos;
		local entity vveh;
		vveh = self.enemy;
		if ((vveh == world))
		{
			vveh = self;
		}
		mpos_x = vveh.origin_x;
		mpos_y = vveh.origin_y;
		mpos_z = -2280;  // hardcoded para descartar bugs de variable

		// HELI: lo movemos al minimap. pointcontents-death suprimida.
		// takedamage = DAMAGE_NO para bloquear T_Damage de cualquier
		// fuente durante el peek (combat.qc:143).
		if ((vveh != self))
		{
			setorigin(vveh, mpos);
			vveh.velocity = '0 0 0';
			vveh.avelocity = '0 0 0';
			vveh.movetype = MOVETYPE_NOCLIP;
			vveh.solid = SOLID_NOT;
			vveh.takedamage = DAMAGE_NO;
		}
		// PLAYER (self).
		setorigin(self, mpos);
		self.velocity = '0 0 0';
		self.movetype = MOVETYPE_NOCLIP;
		self.solid = SOLID_NOT;
		self.view_ofs = '0 0 1';
		self.v_angle = '90 0 0';
		self.angles = '90 0 0';
		self.fixangle = TRUE;
		// OLDENEMY (chasecam).
		if ((self.oldenemy != world))
		{
			setorigin(self.oldenemy, mpos);
			self.oldenemy.view_ofs = '0 0 0';
			self.oldenemy.angles = '90 0 0';
			self.oldenemy.velocity = '0 0 0';
			self.oldenemy.avelocity = '0 0 0';
			self.oldenemy.movetype = MOVETYPE_NONE;
			self.oldenemy.solid = SOLID_NOT;
		}

		// Forzar setview cada frame para reapuntar la cámara al
		// chasecam (oldenemy) que está dentro del minimap. Algunos
		// engines pueden haber descartado el setview anterior; el spam
		// continuo lo machaca.
		msg_entity = self;
		if ((self.oldenemy != world))
		{
			WriteByte(MSG_ONE, 5);   // svc_setview
			WriteEntity(MSG_ONE, self.oldenemy);
		}
		WriteByte(MSG_ONE, 10);  // svc_setangle
		WriteAngle(MSG_ONE, 90);
		WriteAngle(MSG_ONE, 0);
		WriteAngle(MSG_ONE, 0);

		// Debug exhaustivo cada 0.5s. Necesitamos saber TODOS los Z.
		if ((floor(time * 2) != self.minimap_dbg_last_t))
		{
			self.minimap_dbg_last_t = floor(time * 2);
			bprint("[mm] selfZ=");
			bprint(ftos(floor(self.origin_z)));
			bprint(" heliZ=");
			bprint(ftos(floor(vveh.origin_z)));
			bprint(" oldZ=");
			if ((self.oldenemy != world))
			{
				bprint(ftos(floor(self.oldenemy.origin_z)));
			}
			else
			{
				bprint("?");
			}
			bprint(" voff=");
			bprint(ftos(floor(self.view_ofs_z)));
			bprint("\n");
		}
		return;
	}

	if (self.enemy)
	{
		stemp = self.enemy;
		if ((((self.missileview_on == 1) && (self.lastmiss.origin != '0 0 0')) && ((self.lastmiss.owner == self) || (self.lastmiss.owner == self.enemy))))
		{
			stemp = self.lastmiss;
		}
		makevectors(self.v_angle);
		r = self.oldenemy.style;
		v_forward = ((v_up * r) - (v_forward * self.distance));
		traceline(stemp.origin, (stemp.origin + (v_up * r)), TRUE, world);
		v1 = trace_endpos;
		v2 = (stemp.origin + v_forward);
		if ((self.style < 7))
		{
			v2 = (v2 + (stemp.velocity * frametime));
		}
		else
		{
			if (((self.style < 10) || (stemp.speed != 0)))
			{
				v2 = (v2 + (self.velocity * frametime));
			}
		}
		traceline(v1, v2, FALSE, self.enemy);
		v_forward = normalize((v2 - v1));
		if ((self.enemy != self))
		{
			setorigin(self.oldenemy, (trace_endpos - (v_forward * 4)));
		}
		if (((self.enemy != self) && ((self.style < 7) || (self.enemy.owner != self))))
		{
			setorigin(self, self.oldenemy.origin);
		}
		if ((self.enemy.owner == self))
		{
			self.enemy.team = self.team;
		}
		if (((self.enemy.takedamage == 0) && (self.enemy.model != "progs/h_player.mdl")))
		{
			self.enemy = world;
		}
	}
};

void() PlayerPostThink =
{
	local float mspeed;
	local float aspeed;
	local float r;
	local vector v1;
	local entity e;

	if ((self.view_ofs == '0 0 0'))
	{
		return;
	}
	if ((self.noise != ""))
	{
		if (((self.enemy.health > 0) && (self.enemy.owner == self)))
		{
			sound(self.enemy, CHAN_VOICE, self.noise, 1, ATTN_NORM);
		}
		else
		{
			sound(self, CHAN_VOICE, self.noise, 1, ATTN_NORM);
		}
		self.noise = "";
	}
	if (((self.impulse > 30) && (self.impulse < 100)))
	{
		if ((self.enemy.health > 0))
		{
			send_voicemsg((self.impulse - 30), self.enemy);
		}
		if (((self.impulse > 60) && (self.impulse < 70)))
		{
			comm_control((self.impulse - 61));
		}
	}
	if (!self.oldenemy)
	{
		Create_chasecam();
	}
	if (self.deadflag)
	{
		self.missileview_on = 0;
		self.lastmiss = world;
		SetCameraPlace();
		return;
	}
	if ((self.toyview == -1))
	{
		self.waterlevel = 0;
		self.watertype = -1;
		if ((self.style == 1))
		{
			start_aircraft1();
		}
		else
		{
			if ((self.style == 2))
			{
				start_aircraft2();
			}
			else
			{
				if ((self.style == 3))
				{
					start_aircraft3();
				}
				else
				{
					if ((self.style == 4))
					{
						start_aircraft4();
					}
					else
					{
						if ((self.style == 5))
						{
							start_aircraft5();
						}
						else
						{
							if ((self.style == 6))
							{
								start_helo1();
							}
							else
							{
								if ((self.style == 7))
								{
									self.movetype = MOVETYPE_WALK;
									start_groundveh1();
								}
								else
								{
									if ((self.style == 8))
									{
										self.movetype = MOVETYPE_WALK;
										start_groundveh2();
									}
									else
									{
										if ((self.style == 9))
										{
											self.movetype = MOVETYPE_WALK;
											start_groundveh3();
										}
										else
										{
											if ((self.style == 10))
											{
												start_groundveh4();
											}
											else
											{
												if ((self.style == 11))
												{
													self.movetype = MOVETYPE_WALK;
													start_groundveh5();
												}
												else
												{
													self.style = 6;
													start_helo1();
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
		if (((self.style < 6) && self.enemy.landed))
		{
			comm_control(1);
		}
		self.missileview_on = 0;
		self.lastmiss = world;
		if (!(cvar("temp1") & 2))
		{
			e = spawn();
			setmodel(e, "progs/s_target.spr");
			setorigin(e, self.enemy.origin);
			e.owner = self;
			self.trigger_field = e;
		}
		W_SetCurrentAmmo();
		self.enemy.ts = self.ts;
		self.spawn_finished = (time + 1);
		if (self.trigger_field)
		{
			self.trigger_field.think = target_think;
			self.trigger_field.nextthink = (time + 1);
		}
		self.enemy.think = vehicle_think;
		self.enemy.nextthink = (time + 1);
	}
	if ((self.spawn_finished > time))
	{
		v1 = self.enemy.angles;
		v1_x = (0 - v1_x);
		msg_entity = self;
		WriteByte(MSG_ONE, 5);
		WriteEntity(MSG_ONE, self.oldenemy);
		WriteByte(MSG_ONE, 10);
		WriteAngle(MSG_ONE, v1_x);
		WriteAngle(MSG_ONE, v1_y);
		WriteAngle(MSG_ONE, 0);
		self.toyview = 0;
		self.angles = v1;
		self.v_angle = v1;
	}
	W_WeaponFrame();
	SetCameraPlace();
	if ((self.enemy.trigger_field == world))
	{
		self.items = (self.items - (self.items & IT_SHELLS));
	}
	else
	{
		self.items = (self.items | IT_SHELLS);
	}
	CheckPowerups();
	// Re-pin al minimap al FINAL del PostThink, después de que
	// SetCameraPlace haya colocado oldenemy pegado al helo. Nuestra
	// última palabra antes del render mueve la cámara al minimap.
	Minimap_PostThink();
};

void() ClientConnect =
{
	local float tmp;
	local float tmp2;
	local entity e;

	bprint(self.netname);
	bprint(" entered the game\n");
	if (intermission_running)
	{
		ExitIntermission();
	}
};

void() ClientDisconnect =
{
	if (gameover)
	{
		return;
	}
	ClientKill();
	bprint(self.netname);
	bprint(" left the game with ");
	bprint(ftos(self.frags));
	bprint(" frags\n");
	sound(self, CHAN_BODY, "player/tornoff2.wav", 1, ATTN_NONE);
	set_suicide_frame();
};
