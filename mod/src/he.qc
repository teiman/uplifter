//Decompiled code. Please respect the original copyright.
void() HE_Fall;

void() T_HETouch =
{
	local float damg;
	local float temp;
	local entity stemp;
	local entity stemp2;

	if ((other.solid == SOLID_TRIGGER))
	{
		return;
	}
	if (((other == self.owner) || (other.owner == self.owner)))
	{
		return;
	}
	if ((self.owner.flags & FL_GODMODE))
	{
		return;
	}
	// Running over a civilian: don't crash — squash them. Kill the civilian
	// with a player-death squelch and keep flying, no damage to the helo.
	if ((other.classname == "civilian"))
	{
		sound(other, CHAN_VOICE, "player/udeath.wav", 1, ATTN_NORM);
		T_Damage(other, self, self.owner, 1000);
		return;
	}
	if ((other != world))
	{
		if ((!other.takedamage && (other.solid < 2)))
		{
			return;
		}
	}
	if ((other.classname == "func_button"))
	{
		return;
	}
	// Soft landing: alive helo touches anything with moderate velocity → no damage.
	// Takeoff cooldown: after lifting off, ignore brief ground contacts so a
	// fresh +pip click can't be cut short by the helo dipping back into the
	// terrain it just left.
	if (((self.health > 0) && (vlen(self.velocity) < 250) && (time >= self.takeoff_until)))
	{
		if (((fabs(self.angles_x) < 45) && (fabs(self.angles_z) < 45)))
		{
			if (!self.landed)
			{
				sprint(self.goalentity, "Landed.\n");
			}
			self.landed = 1;
			self.thru = 0;
			self.groundentity = other;
			self.angles_x = 0;
			self.angles_z = 0;
			self.avelocity = '0 0 0';
			self.velocity = '0 0 0';
			return;
		}
	}
	if (((other.classname == "func_runway") && (self.health > 0) && (time >= self.takeoff_until)))
	{
		if (((fabs(self.angles_x) < 20) && (fabs(self.angles_z) < 20)))
		{
			if (!self.landed)
			{
				sprint(self.goalentity, "Landed.\n");
			}
			self.landed = 1;
			self.thru = 0;
			self.groundentity = other;
			self.angles_x = 0;
			self.angles_z = 0;
			self.avelocity = '0 0 0';
			self.velocity = '0 0 0';
			self.origin_z = ((other.origin_z + other.maxs_z) + 16);
			return;
		}
	}
	WriteByte(MSG_BROADCAST, SVC_TEMPENTITY);
	WriteByte(MSG_BROADCAST, TE_EXPLOSION);
	WriteCoord(MSG_BROADCAST, self.origin_x);
	WriteCoord(MSG_BROADCAST, self.origin_y);
	WriteCoord(MSG_BROADCAST, self.origin_z);
	temp = self.goalentity.frags;
	if ((((other == world) || (other.health > 0)) || ((self.health < 1) && (time > self.pain_finished))))
	{
		self.origin = (self.origin - (normalize(self.velocity) * 8));
		setorigin(self.goalentity, self.origin);
		T_RadiusDamage(self, self, 240, self);
		if ((self.health > 0))
		{
			self.goalentity.frags = (temp - 1);
			bprint(self.goalentity.netname);
			bprint(" crashed into ");
			if ((other != world))
			{
				if (other.netname)
				{
					bprint(other.netname);
				}
				else
				{
					if ((other.classname == "func_xwall"))
					{
						bprint("a building");
					}
					else
					{
						if ((other.classname == "func_runway"))
						{
							bprint("a runway");
						}
					}
				}
				bprint("\n");
			}
			else
			{
				bprint("the ground\n");
			}
			self.health = 0;
		}
		self.takedamage = DAMAGE_NO;
		BecomeExplosion();
		Throw_ACgib();
		Throw_ACgib();
		Throw_ACgib();
		Throw_ACgib();
		T_Damage(self.owner, self.owner, self.owner, 1000);
		self.touch = SUB_Null;
	}
	else
	{
		T_Damage(other, self, self, 240);
		if ((self.health > 0))
		{
			self.pain_finished = (time + 0.3);
			self.goalentity.frags = (temp - 1);
			bprint(self.goalentity.netname);
			bprint(" crashed into ");
			if ((other != world))
			{
				if (other.netname)
				{
					bprint(other.netname);
				}
				else
				{
					if ((other.classname == "func_xwall"))
					{
						bprint("a building");
					}
					else
					{
						if ((other.classname == "func_runway"))
						{
							bprint("a runway");
						}
					}
				}
				bprint("\n");
			}
		}
		self.health = 0;
		self.th_die = SUB_Null;
		self.touch = T_HETouch;
		HE_Fall();
	}
};

void() HE_Fall =
{
	local vector v1;
	local vector v2;
	local vector v3;

	v1 = '0 0 0';
	v1_x = (-70 - self.angles_x);
	v2 = '0 0 360';
	if ((v1_x < 0))
	{
		v2_x = -20;
	}
	if ((fabs(v1_x) < 2))
	{
		v2_x = 0;
		self.angles_x = -70;
	}
	self.avelocity = v2;
	self.velocity = (self.velocity + (('0 0 -1' * cvar("sv_gravity")) * 0.1));
	if ((self.flags & FL_ONGROUND))
	{
		self.flags = (self.flags - FL_ONGROUND);
	}
	self.think = HE_Fall;
	self.nextthink = (time + 0.1);
};

void() HE_Die =
{
	drop_vehicle_loot(self.origin);
	WriteByte(MSG_BROADCAST, SVC_TEMPENTITY);
	WriteByte(MSG_BROADCAST, TE_EXPLOSION);
	WriteCoord(MSG_BROADCAST, self.origin_x);
	WriteCoord(MSG_BROADCAST, self.origin_y);
	WriteCoord(MSG_BROADCAST, self.origin_z);
	self.pain_finished = (time + 0.3);
	self.touch = T_HETouch;
	HE_Fall();
};
