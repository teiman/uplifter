//Decompiled code. Please respect the original copyright.
void() player_run;
void(vector org, vector vel, float damage) SpawnBlood;
void() SuperDamageSound;
void() AC_Flare;
void() AC_Die;
vector(float minim, float maxdist) AC_aim;
void() T_ACTouch;
float(entity e, float atype) check_ammo;

void() W_Precache =
{
	precache_sound("weapons/r_exp3.wav");
	precache_sound("weapons/rocket1i.wav");
	precache_sound("weapons/sgun1.wav");
	precache_sound("weapons/guncock.wav");
	precache_sound("weapons/ric1.wav");
	precache_sound("weapons/ric2.wav");
	precache_sound("weapons/ric3.wav");
	precache_sound("weapons/spike2.wav");
	precache_sound("weapons/tink1.wav");
	precache_sound("weapons/grenade.wav");
	precache_sound("weapons/bounce.wav");
	precache_sound("weapons/shotgn2.wav");
};

float() crandom =
{
	return ((2 * (random() - 0.5)));
};

vector() wall_velocity =
{
	local vector vel;

	vel = normalize(self.velocity);
	vel = normalize(((vel + (v_up * (random() - 0.5))) + (v_right * (random() - 0.5))));
	vel = (vel + (2 * trace_plane_normal));
	vel = (vel * 200);
	return (vel);
};

void(vector org, vector vel) SpawnMeatSpray =
{
	local entity missile;
	local entity mpuff;

	missile = spawn();
	missile.owner = self;
	missile.movetype = MOVETYPE_BOUNCE;
	missile.solid = SOLID_NOT;
	makevectors(self.angles);
	missile.velocity = vel;
	missile.velocity_z = ((missile.velocity_z + 250) + (50 * random()));
	missile.avelocity = '3000 1000 2000';
	missile.nextthink = (time + 1);
	missile.think = SUB_Remove;
	setmodel(missile, "progs/zom_gib.mdl");
	setsize(missile, '0 0 0', '0 0 0');
	setorigin(missile, org);
};

void(vector org, vector vel, float damage) SpawnBlood =
{
	particle(org, (vel * 0.1), 225, (damage * 2));
};

void(float damage) spawn_touchblood =
{
	local vector vel;

	vel = (wall_velocity() * 0.2);
	SpawnBlood((self.origin + (vel * 0.01)), vel, damage);
};

void(vector org, vector vel) SpawnChunk =
{
	particle(org, (vel * 0.02), 0, 10);
};
entity multi_ent;
float multi_damage;

void() ClearMultiDamage =
{
	multi_ent = world;
	multi_damage = 0;
};

void() ApplyMultiDamage =
{
	if (!multi_ent)
	{
		return;
	}
	T_Damage(multi_ent, self, self, multi_damage);
};

void(entity hit, float damage) AddMultiDamage =
{
	if (!hit)
	{
		return;
	}
	if ((hit != multi_ent))
	{
		ApplyMultiDamage();
		multi_damage = damage;
		multi_ent = hit;
	}
	else
	{
		multi_damage = (multi_damage + damage);
	}
};

void(float damage, vector dir) TraceAttack =
{
	local vector vel;
	local vector org;

	vel = normalize(((dir + (v_up * crandom())) + (v_right * crandom())));
	vel = (vel + (2 * trace_plane_normal));
	vel = (vel * 200);
	org = (trace_endpos - (dir * 4));
	if (trace_ent.takedamage)
	{
		SpawnBlood(org, (vel * 0.2), damage);
		AddMultiDamage(trace_ent, damage);
	}
	else
	{
		WriteByte(MSG_BROADCAST, SVC_TEMPENTITY);
		WriteByte(MSG_BROADCAST, TE_GUNSHOT);
		WriteCoord(MSG_BROADCAST, org_x);
		WriteCoord(MSG_BROADCAST, org_y);
		WriteCoord(MSG_BROADCAST, org_z);
	}
};

void(float shotcount, vector dir, vector spread) FireBullets =
{
	local vector direction;
	local vector src;

	makevectors(self.v_angle);
	src = (self.origin + (v_forward * 10));
	src_z = (self.absmin_z + (self.size_z * 0.7));
	ClearMultiDamage();
	while ((shotcount > 0))
	{
		direction = ((dir + ((crandom() * spread_x) * v_right)) + ((crandom() * spread_y) * v_up));
		traceline(src, (src + (direction * 2048)), FALSE, self);
		if ((trace_fraction != 1))
		{
			TraceAttack(4, direction);
		}
		shotcount = (shotcount - 1);
	}
	ApplyMultiDamage();
};

void() s_explode1 = [ 0, s_explode2 ]
{
};

void() s_explode2 = [ 1, s_explode3 ]
{
};

void() s_explode3 = [ 2, s_explode4 ]
{
};

void() s_explode4 = [ 3, s_explode5 ]
{
};

void() s_explode5 = [ 4, s_explode6 ]
{
};

void() s_explode6 = [ 5, SUB_Remove ]
{
};

void() BecomeExplosion =
{
	self.movetype = MOVETYPE_NONE;
	self.velocity = '0 0 0';
	self.touch = SUB_Null;
	setmodel(self, "progs/s_explod.spr");
	self.solid = SOLID_NOT;
	s_explode1();
};

void() T_MissileTouch =
{
	local float damg;

	if ((other == self.owner))
	{
		return;
	}
	if ((pointcontents(self.origin) == CONTENT_SKY))
	{
		remove(self);
		return;
	}
	damg = (100 + (random() * 20));
	if (other.health)
	{
		if ((other.classname == "monster_shambler"))
		{
			damg = (damg * 0.5);
		}
		T_Damage(other, self, self.owner, damg);
	}
	T_RadiusDamage(self, self.owner, 120, other);
	self.origin = (self.origin - (8 * normalize(self.velocity)));
	WriteByte(MSG_BROADCAST, SVC_TEMPENTITY);
	WriteByte(MSG_BROADCAST, TE_EXPLOSION);
	WriteCoord(MSG_BROADCAST, self.origin_x);
	WriteCoord(MSG_BROADCAST, self.origin_y);
	WriteCoord(MSG_BROADCAST, self.origin_z);
	BecomeExplosion();
};

void(vector p1, vector p2, entity from, float damage) LightningDamage =
{
	local entity e1;
	local entity e2;
	local vector f;

	f = (p2 - p1);
	normalize(f);
	f_x = (0 - f_y);
	f_y = f_x;
	f_z = 0;
	f = (f * 16);
	e2 = world;
	e1 = world;
	traceline(p1, p2, FALSE, self);
	if (trace_ent.takedamage)
	{
		particle(trace_endpos, '0 0 100', 225, (damage * 4));
		T_Damage(trace_ent, from, from, damage);
		if ((self.classname == "player"))
		{
			if ((other.classname == "player"))
			{
				trace_ent.velocity_z = (trace_ent.velocity_z + 400);
			}
		}
	}
	e1 = trace_ent;
	traceline((p1 + f), (p2 + f), FALSE, self);
	if (((trace_ent != e1) && trace_ent.takedamage))
	{
		particle(trace_endpos, '0 0 100', 225, (damage * 4));
		T_Damage(trace_ent, from, from, damage);
	}
	e2 = trace_ent;
	traceline((p1 - f), (p2 - f), FALSE, self);
	if ((((trace_ent != e1) && (trace_ent != e2)) && trace_ent.takedamage))
	{
		particle(trace_endpos, '0 0 100', 225, (damage * 4));
		T_Damage(trace_ent, from, from, damage);
	}
};
void() spike_touch;
void() superspike_touch;

void(vector org, vector dir) launch_spike =
{
	newmis = spawn();
	newmis.owner = self;
	newmis.movetype = MOVETYPE_FLYMISSILE;
	newmis.solid = SOLID_BBOX;
	newmis.angles = vectoangles(dir);
	newmis.touch = spike_touch;
	newmis.classname = "spike";
	newmis.think = SUB_Remove;
	newmis.nextthink = (time + 6);
	setmodel(newmis, "progs/spike.mdl");
	setsize(newmis, VEC_ORIGIN, VEC_ORIGIN);
	setorigin(newmis, org);
	newmis.velocity = (dir * 1000);
};
.float hit_z;

void() spike_touch =
{
	local float rand;

	if ((other == self.owner))
	{
		return;
	}
	if ((other.owner == self.owner))
	{
		return;
	}
	if ((other.solid == SOLID_TRIGGER))
	{
		return;
	}
	if ((pointcontents(self.origin) == CONTENT_SKY))
	{
		remove(self);
		return;
	}
	if (other.takedamage)
	{
		spawn_touchblood(9);
		T_Damage(other, self, self.owner, 9);
	}
	else
	{
		WriteByte(MSG_BROADCAST, SVC_TEMPENTITY);
		if ((self.classname == "wizspike"))
		{
			WriteByte(MSG_BROADCAST, TE_WIZSPIKE);
		}
		else
		{
			if ((self.classname == "knightspike"))
			{
				WriteByte(MSG_BROADCAST, TE_KNIGHTSPIKE);
			}
			else
			{
				WriteByte(MSG_BROADCAST, TE_SPIKE);
			}
		}
		WriteCoord(MSG_BROADCAST, self.origin_x);
		WriteCoord(MSG_BROADCAST, self.origin_y);
		WriteCoord(MSG_BROADCAST, self.origin_z);
	}
	remove(self);
};

void() superspike_touch =
{
	local float rand;

	if ((other == self.owner))
	{
		return;
	}
	if ((other.solid == SOLID_TRIGGER))
	{
		return;
	}
	if ((pointcontents(self.origin) == CONTENT_SKY))
	{
		remove(self);
		return;
	}
	if (other.takedamage)
	{
		spawn_touchblood(18);
		T_Damage(other, self, self.owner, 18);
	}
	else
	{
		WriteByte(MSG_BROADCAST, SVC_TEMPENTITY);
		WriteByte(MSG_BROADCAST, TE_SUPERSPIKE);
		WriteCoord(MSG_BROADCAST, self.origin_x);
		WriteCoord(MSG_BROADCAST, self.origin_y);
		WriteCoord(MSG_BROADCAST, self.origin_z);
	}
	remove(self);
};

void() W_SetCurrentAmmo =
{
	if (self.th_melee)
	{
		self.th_melee();
	}
	if ((self.wepv == 1))
	{
		self.weaponframe = 1;
	}
	else
	{
		self.weaponframe = 0;
	}
	if ((self.wepv == 2))
	{
		self.weaponmodel = "";
	}
	if ((self.weapon == IT_WEP1))
	{
		self.currentammo = self.ammo_shells;
	}
	else
	{
		if ((self.weapon == IT_WEP2))
		{
			self.currentammo = self.ammo_nails;
		}
		else
		{
			if ((self.weapon == IT_WEP3))
			{
				self.currentammo = self.ammo_rockets;
			}
			else
			{
				if ((self.weapon == IT_WEP4))
				{
					self.currentammo = self.ammo_cells;
				}
				else
				{
					self.currentammo = 0;
				}
			}
		}
	}
};

float() W_BestWeapon =
{
	local float it;

	if ((self.ammo_cells >= 1))
	{
		return (IT_WEP4);
	}
	if ((self.ammo_rockets >= 1))
	{
		return (IT_WEP3);
	}
	if ((self.ammo_nails >= 2))
	{
		return (IT_WEP2);
	}
	return (IT_WEP1);
};

float() W_CheckNoAmmo =
{
	if ((self.currentammo > 1))
	{
		return (TRUE);
	}
	self.weapon = W_BestWeapon();
	W_SetCurrentAmmo();
	return (FALSE);
};

void() W_ChangeWeapon =
{
	local float it;
	local float am;
	local float fl;

	it = self.items;
	am = 0;
	fl = 0;
	if ((self.impulse == 1))
	{
		fl = IT_WEP1;
	}
	else
	{
		if ((self.impulse == 2))
		{
			fl = IT_WEP2;
		}
		else
		{
			if ((self.impulse == 3))
			{
				fl = IT_WEP3;
			}
			else
			{
				if ((self.impulse == 4))
				{
					fl = IT_WEP4;
				}
			}
		}
	}
	self.impulse = 0;
	if (!(self.items & fl))
	{
		sprint(self, "no weapon.\n");
		return;
	}
	if (am)
	{
		sprint(self, "not enough ammo.\n");
		return;
	}
	if ((fl != 0))
	{
		self.weapon = fl;
		W_SetCurrentAmmo();
	}
};

void() CheatCommand =
{
	if ((deathmatch || coop))
	{
		return;
	}
	self.ammo_rock = 250;
	self.ammo_auto = 250;
	self.ammo_shel = 250;
	self.ammo_cell = 250;
	self.ammo_amsl = 250;
	self.ammo_smsl = 250;
	self.ammo_mine = 250;
	self.ammo_bomb = 250;
	check_ammo(self, 0);
	self.impulse = 0;
	W_SetCurrentAmmo();
};

void() CycleWeaponCommand =
{
	local float it;
	local float am;

	it = self.items;
	self.impulse = 0;
	while (1)
	{
		am = 0;
		if ((self.weapon == IT_WEP4))
		{
			self.weapon = IT_WEP1;
		}
		else
		{
			if ((self.weapon == IT_WEP1))
			{
				self.weapon = IT_WEP2;
			}
			else
			{
				if ((self.weapon == IT_WEP2))
				{
					self.weapon = IT_WEP3;
				}
				else
				{
					if ((self.weapon == IT_WEP3))
					{
						self.weapon = IT_WEP4;
					}
				}
			}
		}
		if (((it & self.weapon) && (am == 0)))
		{
			W_SetCurrentAmmo();
			return;
		}
	}
};

void() CycleWeaponReverseCommand =
{
	local float it;
	local float am;

	it = self.items;
	self.impulse = 0;
	while (1)
	{
		am = 0;
		if ((self.weapon == IT_WEP4))
		{
			self.weapon = IT_WEP3;
		}
		else
		{
			if ((self.weapon == IT_WEP3))
			{
				self.weapon = IT_WEP2;
			}
			else
			{
				if ((self.weapon == IT_WEP2))
				{
					self.weapon = IT_WEP1;
				}
				else
				{
					if ((self.weapon == IT_WEP1))
					{
						self.weapon = IT_WEP4;
					}
				}
			}
		}
		if (((it & self.weapon) && (am == 0)))
		{
			W_SetCurrentAmmo();
			return;
		}
	}
};

void() ServerflagsCommand =
{
	serverflags = ((serverflags * 2) + 1);
};

void() QuadCheat =
{
	if ((deathmatch || coop))
	{
		return;
	}
	self.super_time = 1;
	self.super_damage_finished = (time + 30);
	self.items = (self.items | IT_QUAD);
	dprint("quad cheat\n");
};

void() ImpulseCommands =
{
	local vector v1;
	local entity e;

	if (((self.impulse >= 1) && (self.impulse <= 4)))
	{
		W_ChangeWeapon();
	}
	if (((self.impulse == 5) && (self.attack_finished < time)))
	{
		AC_Flare();
		self.attack_finished = (time + 1);
	}
	if (((self.impulse >= 7) && (self.impulse <= 8)))
	{
		// Helo (hud_vtype 2) gets 32 altitude levels; other vehicles keep
		// the original 4-step thrust range.
		local float thru_max;
		if ((self.hud_vtype == 2))
		{
			thru_max = 32;
		}
		else
		{
			thru_max = 4;
		}
		if (((self.impulse == 7) && (self.enemy.thru > 0)))
		{
			self.enemy.thru = (self.enemy.thru - 1);
			self.fly_sound = time;
		}
		if (((self.impulse == 8) && (self.enemy.thru < thru_max)))
		{
			// Smart takeoff (helo only): if sitting on ground and player
			// requests +1 pip, jump straight to a thru level whose absolute
			// target altitude clears the current ground, so a single click
			// reliably lifts the helo off a raised platform. Also arm a
			// short cooldown to keep T_HETouch from re-landing immediately.
			if (((self.hud_vtype == 2) && self.enemy.landed))
			{
				local float WATER_Z;
				local float needed;
				WATER_Z = -8;
				needed = ceil(((self.enemy.origin_z + 72) - WATER_Z) / 64);
				if ((needed < 1))
				{
					needed = 1;
				}
				if ((needed > thru_max))
				{
					needed = thru_max;
				}
				self.enemy.thru = needed;
				self.enemy.takeoff_until = (time + 1.5);
			}
			else
			{
				self.enemy.thru = (self.enemy.thru + 1);
			}
			self.fly_sound = time;
		}
	}
	if ((self.impulse == 22))
	{
		if ((self.hud_vtype == 2))
		{
			self.enemy.thru = 0;
			self.fly_sound = time;
			sprint(self, "landing...\n");
		}
	}
	if ((self.impulse == 23))
	{
		self.back_held = 1;
	}
	if ((self.impulse == 24))
	{
		self.back_held = 0;
	}
	if ((self.impulse == 9))
	{
		self.missileview_on = (1 - self.missileview_on);
		if (self.missileview_on)
		{
			sprint(self, "Missile view on\n");
		}
		else
		{
			sprint(self, "Missile view off\n");
		}
	}
	if ((self.impulse == 11))
	{
		CheatCommand();
	}
	if ((self.impulse == 12))
	{
		CycleWeaponCommand();
	}
	if ((self.impulse == 13))
	{
		ServerflagsCommand();
	}
	if ((self.impulse == 14))
	{
		CycleWeaponReverseCommand();
	}
	// Stars test impulses: 30 adds one, 31 clears to 0.
	if ((self.impulse == 30))
	{
		Stars_Add(1);
		sprint(self, "stars: ");
		sprint(self, ftos(floor(self.stars)));
		sprint(self, "/5\n");
	}
	if ((self.impulse == 31))
	{
		Stars_Set(0);
		sprint(self, "stars cleared\n");
	}
	// Scrap test: 32 spawns one in front of the player. 33 grants +10 directly.
	if ((self.impulse == 32))
	{
		local entity sc;
		local entity oplr;
		local vector dir;
		oplr = self;
		sc = spawn();
		makevectors(self.v_angle);
		dir = (self.origin + (v_forward * 128));
		dir_z = (self.origin_z + 16);
		setorigin(sc, dir);
		self = sc;
		info_scrap();
		self = oplr;
	}
	if ((self.impulse == 33))
	{
		self.scrap = (self.scrap + 10);
		sprint(self, "scrap: ");
		sprint(self, ftos(self.scrap));
		sprint(self, "\n");
	}
	if ((self.impulse == 255))
	{
		QuadCheat();
	}
	if (((self.impulse >= 100) && (self.impulse <= 104)))
	{
		self.toyview = (self.impulse - 100);
		v1 = self.enemy.angles;
		v1_x = (0 - v1_x);
		if ((self.toyview == 1))
		{
			v1_y = anglemod((270 + v1_y));
		}
		else
		{
			if ((self.toyview == 2))
			{
				v1_y = anglemod((180 + v1_y));
			}
			else
			{
				if ((self.toyview == 3))
				{
					v1_y = anglemod((90 + v1_y));
				}
			}
		}
		if ((self.toyview < 4))
		{
			msg_entity = self;
			WriteByte(MSG_ONE, 5);
			WriteEntity(MSG_ONE, self.oldenemy);
			WriteByte(MSG_ONE, 10);
			WriteAngle(MSG_ONE, v1_x);
			WriteAngle(MSG_ONE, v1_y);
			WriteAngle(MSG_ONE, 0);
		}
	}
	if ((self.impulse == 105))
	{
		self.toyview = 0;
	}
	if ((self.impulse == 110))
	{
		self.lefty = -1;
	}
	if ((self.impulse == 111))
	{
		self.lefty = 1;
	}
	if ((self.impulse == 109))
	{
		self.lefty = 0;
	}
	if (self.impulse == 112)
		self.jetpack = 1;
	if (self.impulse == 113)
		self.jetpack = 0;
	self.impulse = 0;
};

void() W_WeaponFrame =
{
	local float i;

	if ((self.enemy.owner == self))
	{
		self.th_run();
	}
	ImpulseCommands();
	if ((self.rad_time > time))
	{
		self.armortype = (self.armortype | 2);
	}
	self.items = (self.items - (self.items & ((IT_ARMOR1 | IT_ARMOR2) | IT_ARMOR3)));
	if ((self.armortype == 1))
	{
		self.items = (self.items + IT_ARMOR1);
	}
	else
	{
		if ((self.armortype == 2))
		{
			self.items = (self.items + IT_ARMOR2);
		}
		else
		{
			if ((self.armortype == 3))
			{
				self.items = (self.items + IT_ARMOR3);
			}
		}
	}
	self.armortype = 0;
	if ((time < self.attack_finished))
	{
		return;
	}
	if (self.button0)
	{
		SuperDamageSound();
		self.shots_fired = (self.shots_fired + 1);
		self.th_missile();
	}
};

void() SuperDamageSound =
{
	if ((self.super_damage_finished > time))
	{
		if ((self.super_sound < time))
		{
			self.super_sound = (time + 1);
			sound(self.enemy, CHAN_BODY, "items/damage3.wav", 1, ATTN_NORM);
		}
	}
	return;
};
