// upgrades.qc — Day package chooser (A vs B per day).
//
// Each day 2..5 offers two packages. The player picks one and the
// corresponding UPG_* bits are ORed into self.upgrades. The other
// package is lost forever for this session.
//
// Choice flow:
//   1. Day_Advance() calls Upgrades_OfferDay(day).
//   2. We set self.upgrade_choice_pending = day and print A/B options.
//   3. Player presses impulse 101 (pick A) or impulse 102 (pick B).
//   4. Upgrades_Pick applies the package and clears pending.
//
// Until the player picks, the offered day's choice is pending. A simple
// auto-pick at the next day boundary keeps the game from stalling.

void(float day) Upgrades_OfferDay =
{
	self.upgrade_choice_pending = day;
	sprint(self, "\n=== Logistic reinforcement — choose package ===\n");
	if ((day == 2))
	{
		sprint(self, "  [101] A: Flares + auto-vacuum scrap\n");
		sprint(self, "  [102] B: Turbo + extended siphon range\n");
	}
	else
	{
		if ((day == 3))
		{
			sprint(self, "  [101] A: Autocannon + faster ammo/scrap respawn\n");
			sprint(self, "  [102] B: Sidewinders + siphon picks up ammo\n");
		}
		else
		{
			if ((day == 4))
			{
				sprint(self, "  [101] A: Hellfires + infinite autocannon ammo\n");
				sprint(self, "  [102] B: Armor x1.5 + double siphon range\n");
			}
			else
			{
				if ((day == 5))
				{
					sprint(self, "  [101] A: Rockets + infinite ammo on everything\n");
					sprint(self, "  [102] B: Faster reload + armor x2\n");
				}
			}
		}
	}
};

// Apply a package's bits. Called from Upgrades_Pick.
void(float day, float pick_a) Upgrades_Apply =
{
	if ((day == 2))
	{
		if (pick_a)
		{
			self.upgrades = (self.upgrades | UPG_FLARES);
			self.upgrades = (self.upgrades | UPG_SCRAP_AUTO);
		}
		else
		{
			self.upgrades = (self.upgrades | UPG_TURBO);
			self.upgrades = (self.upgrades | UPG_SIPHON_RANGE_PLUS);
		}
	}
	else
	{
		if ((day == 3))
		{
			if (pick_a)
			{
				self.upgrades = (self.upgrades | UPG_AUTOCANNON);
				self.upgrades = (self.upgrades | UPG_RESPAWN_FAST);
			}
			else
			{
				self.upgrades = (self.upgrades | UPG_SIDEWINDERS);
				self.upgrades = (self.upgrades | UPG_SIPHON_AMMO);
			}
		}
		else
		{
			if ((day == 4))
			{
				if (pick_a)
				{
					self.upgrades = (self.upgrades | UPG_HELLFIRES);
					self.upgrades = (self.upgrades | UPG_AMMO_INF_AUTOCANNON);
				}
				else
				{
					self.upgrades = (self.upgrades | UPG_ARMOR_15);
					self.upgrades = (self.upgrades | UPG_SIPHON_RANGE_DOUBLE);
				}
			}
			else
			{
				if ((day == 5))
				{
					if (pick_a)
					{
						self.upgrades = (self.upgrades | UPG_ROCKETS);
						self.upgrades = (self.upgrades | UPG_AMMO_INF_ALL);
					}
					else
					{
						self.upgrades = (self.upgrades | UPG_RELOAD_FAST);
						self.upgrades = (self.upgrades | UPG_ARMOR_2);
					}
				}
			}
		}
	}
};

// Called when the player presses impulse 101 or 102.
void(float pick_a) Upgrades_Pick =
{
	local float day;

	day = self.upgrade_choice_pending;
	if ((day <= 0))
	{
		sprint(self, "no package pending.\n");
		return;
	}
	Upgrades_Apply(day, pick_a);
	self.upgrade_choice_pending = 0;
	if (pick_a)
	{
		sprint(self, "Package A installed.\n");
	}
	else
	{
		sprint(self, "Package B installed.\n");
	}
};

// Convenience: returns 1 if upgrade flag is set.
float(float flag) Upgrades_Has =
{
	if ((self.upgrades & flag))
	{
		return (1);
	}
	return (0);
};
