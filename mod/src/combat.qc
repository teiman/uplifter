//Decompiled code. Please respect the original copyright.
void() T_MissileTouch;
void() info_player_start;
void(entity targ, entity attacker) AC_Obituary;
void() monster_death_use;

float(entity targ, entity inflictor) CanDamage =
{
	if ((targ.movetype == MOVETYPE_PUSH))
	{
		traceline(inflictor.origin, (0.5 * (targ.absmin + targ.absmax)), TRUE, self);
		if ((trace_fraction == 1))
		{
			return (TRUE);
		}
		if ((trace_ent == targ))
		{
			return (TRUE);
		}
		return (FALSE);
	}
	traceline(inflictor.origin, targ.origin, TRUE, self);
	if ((trace_fraction == 1))
	{
		return (TRUE);
	}
	traceline(inflictor.origin, (targ.origin + '15 15 0'), TRUE, self);
	if ((trace_fraction == 1))
	{
		return (TRUE);
	}
	traceline(inflictor.origin, (targ.origin + '-15 -15 0'), TRUE, self);
	if ((trace_fraction == 1))
	{
		return (TRUE);
	}
	traceline(inflictor.origin, (targ.origin + '-15 15 0'), TRUE, self);
	if ((trace_fraction == 1))
	{
		return (TRUE);
	}
	traceline(inflictor.origin, (targ.origin + '15 -15 0'), TRUE, self);
	if ((trace_fraction == 1))
	{
		return (TRUE);
	}
	return (FALSE);
};

void(entity targ, entity attacker) Killed =
{
	local entity oself;

	oself = self;
	self = targ;
	if ((self.health < -99))
	{
		self.health = -99;
	}
	if ((self.classname == "player"))
	{
		if (self.trigger_field)
		{
			remove(self.trigger_field);
		}
		self.enemy = self.enemy.enemy;
		self.trigger_field = world;
		self.pain_finished = (time + 1);
	}
	if (((self.value > 0) && (self.classname != "player")))
	{
		if (!deathmatch)
		{
			if ((self.ts != T1))
			{
				killedvalues = (killedvalues + self.value);
			}
			else
			{
				killedvalues = (killedvalues - self.value);
			}
		}
		else
		{
			if (((teamplay > 0) && (self.ts != T0)))
			{
				bprint(attacker.netname);
				if ((self.ts != attacker.ts))
				{
					givefrags(attacker, self, self.value);
					giveteamfrags(attacker, self.value);
					bprint(" destroys enemy ");
					bprint(self.netname);
					bprint("\n");
				}
				else
				{
					attacker.frags = (attacker.frags - self.value);
					bprint(" has fun bombing friendly forces\n");
				}
			}
		}
	}
	if (((self.movetype == MOVETYPE_PUSH) || (self.movetype == MOVETYPE_NONE)))
	{
		self.th_die();
		self = oself;
		return;
	}
	if (((self.classname != "player") && (attacker.classname != "player")))
	{
		self.enemy = attacker;
	}
	if (((self.flags & FL_MONSTER) && !deathmatch))
	{
		killed_monsters = (killed_monsters + 1);
		WriteByte(MSG_ALL, SVC_KILLEDMONSTER);
	}
	if (((self.classname != "plane") && (self.classname != "monster_drone")))
	{
		self.takedamage = DAMAGE_NO;
		self.touch = SUB_Null;
		monster_death_use();
	}
	if (((self.owner.classname == "player") && (self == self.owner.enemy)))
	{
		AC_Obituary(self, attacker);
	}
	if (self.th_die)
	{
		self.th_die();
	}
	self = oself;
};

void(entity targ, entity inflictor, entity attacker, float damage) T_Damage =
{
	local vector dir;
	local entity oldself;
	local float save;
	local float take;

	if (!targ.takedamage)
	{
		return;
	}
	if ((targ.health < 1))
	{
		return;
	}
	if (((targ.classname == "player") && (attacker != targ)))
	{
		return;
	}
	if (((attacker.owner.classname == "player") && (attacker.owner.enemy == attacker)))
	{
		attacker = attacker.owner;
	}
	damage_attacker = attacker;
	// Notoriety: if a player damaged something with FL_MONSTER, bump stars.
	// Civilians share that flag (so walkmove() accepts them) so use the
	// classname to distinguish: "civilian" → +1 star, hostile → +4 stars.
	if (((attacker.classname == "player") && (targ.flags & FL_MONSTER) && (targ != attacker)))
	{
		local entity oself_stars;
		local float kind;
		kind = 0;
		if ((targ.classname == "civilian"))
		{
			kind = 1;
		}
		oself_stars = self;
		self = attacker;
		Stars_OnPlayerDamagedTarget(kind);
		self = oself_stars;
	}
	if ((attacker.super_damage_finished > time))
	{
		damage = (damage * 4);
	}
	save = targ.armorvalue;
	take = ceil((damage - save));
	if ((take < 0))
	{
		take = 0;
	}
	if ((targ.flags & FL_CLIENT))
	{
		targ.dmg_take = (targ.dmg_take + take);
		targ.dmg_save = (targ.dmg_save + save);
		targ.dmg_inflictor = inflictor;
	}
	if ((targ.flags & FL_GODMODE))
	{
		return;
	}
	if ((targ.owner.enemy == targ))
	{
		if ((targ.owner.flags & FL_GODMODE))
		{
			return;
		}
	}
	if ((targ.invincible_finished >= time))
	{
		if ((self.invincible_sound < time))
		{
			sound(targ, CHAN_ITEM, "items/protect3.wav", 1, ATTN_NORM);
			self.invincible_sound = (time + 2);
		}
		return;
	}
	targ.health = (targ.health - take);
	if ((targ.health <= 0))
	{
		Killed(targ, attacker);
		return;
	}
	oldself = self;
	self = targ;
	if ((((self.flags & FL_MONSTER) && (attacker != world)) && (self.classname != "monster_drone")))
	{
		if (((self != attacker) && (attacker != self.enemy)))
		{
			if ((self.ts != attacker.ts))
			{
				if ((attacker.classname == "player"))
				{
					if (((attacker.enemy.owner == attacker) && (attacker.enemy.health > 0)))
					{
						self.enemy = attacker.enemy;
					}
				}
				else
				{
					self.enemy = attacker;
				}
				if (self.enemy)
				{
					FoundTarget();
				}
			}
		}
	}
	if (((self.owner.classname == "player") && ((attacker.takedamage > 0) || (attacker.classname == "player"))))
	{
		if (((self != attacker) && (self.owner != attacker)))
		{
			if ((attacker.classname == "player"))
			{
				if (((attacker.enemy.health > 0) && (attacker.enemy.owner == attacker)))
				{
					self.enemy = attacker.enemy;
				}
			}
			else
			{
				self.enemy = attacker;
			}
		}
	}
	if (self.th_pain)
	{
		self.th_pain(attacker, take);
		if ((skill == 3))
		{
			self.pain_finished = (time + 5);
		}
	}
	self = oldself;
};

void(entity inflictor, entity attacker, float damage, entity ignore) T_RadiusDamage =
{
	local float points;
	local entity head;
	local vector org;
	local string persereika;

	head = findradius(inflictor.origin, (damage + 40));
	while (head)
	{
		if ((head != ignore))
		{
			if (head.takedamage)
			{
				org = (head.origin + ((head.mins + head.maxs) * 0.5));
				points = (vlen((inflictor.origin - org)) * 0.5);
				if ((points < 0))
				{
					points = 0;
				}
				points = (damage - points);
				if ((points > 0))
				{
					if (CanDamage(head, inflictor))
					{
						T_Damage(head, inflictor, attacker, points);
						if (((head.owner.classname == "player") && (head == head.owner.enemy)))
						{
							if ((head.owner.style > 6))
							{
								head.owner.velocity = (head.owner.velocity + (normalize((org - inflictor.origin)) * points));
								head.owner.velocity = (head.owner.velocity + ('0 0 1' * points));
								head.owner.flags = (head.owner.flags - (head.owner.flags & FL_ONGROUND));
								head.owner.radiuskiller = attacker;
							}
						}
					}
				}
			}
		}
		head = head.chain;
	}
};

void(entity attacker, float damage) T_BeamDamage =
{
	local float points;
	local entity head;

	head = findradius(attacker.origin, (damage + 40));
	while (head)
	{
		if (head.takedamage)
		{
			points = (0.5 * vlen((attacker.origin - head.origin)));
			if ((points < 0))
			{
				points = 0;
			}
			points = (damage - points);
			if ((head == attacker))
			{
				points = (points * 0.5);
			}
			if ((points > 0))
			{
				if (CanDamage(head, attacker))
				{
					if ((head.classname == "monster_shambler"))
					{
						T_Damage(head, attacker, attacker, (points * 0.5));
					}
					else
					{
						T_Damage(head, attacker, attacker, points);
					}
				}
			}
		}
		head = head.chain;
	}
};
