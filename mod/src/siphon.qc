// siphon.qc — Heli siphon: cono de succión hacia abajo, infinito, sin coste.
//
// Recoge civiles (hacia .pax), chatarra (hacia .scrap) y munición sin
// necesidad de aterrizar. Es solo conveniencia del verbo "recoger".
//
// Alcance base = 256u hacia abajo. Upgrades:
//   UPG_SIPHON_RANGE_PLUS    +50% (384u)
//   UPG_SIPHON_RANGE_DOUBLE  x2   (512u)
// (toman precedencia: doble gana sobre plus si ambas están activas)
//
// UPG_SCRAP_AUTO    recoge chatarra automáticamente al pasar cerca (no requiere apuntar).
// UPG_SIPHON_AMMO   recoge también munición de los enemigos derrotados.
//
// Tick: 4 Hz desde PlayerPreThink en client.qc.

float SIPHON_RANGE_BASE   = 256;
float SIPHON_RANGE_PLUS   = 384;
float SIPHON_RANGE_DOUBLE = 512;
float SIPHON_RADIUS_XY    = 96;
float SIPHON_TICK         = 0.25;

.float siphon_next;

// Calcula el alcance efectivo (en unidades hacia abajo) según upgrades.
float() Siphon_Range =
{
	if ((self.upgrades & UPG_SIPHON_RANGE_DOUBLE))
	{
		return (SIPHON_RANGE_DOUBLE);
	}
	if ((self.upgrades & UPG_SIPHON_RANGE_PLUS))
	{
		return (SIPHON_RANGE_PLUS);
	}
	return (SIPHON_RANGE_BASE);
};

// Devuelve TRUE si la entidad 'cand' está dentro del cono del sifón
// del heli del jugador ('veh').
float(entity veh, entity cand, float range) Siphon_InCone =
{
	local vector d;
	local vector dxy_v;

	d = (cand.origin - veh.origin);
	if ((d_z > 0))
	{
		// Está más alto que el heli, no.
		return (FALSE);
	}
	if ((d_z < (0 - range)))
	{
		return (FALSE);
	}
	dxy_v = d;
	dxy_v_z = 0;
	if ((vlen(dxy_v) > SIPHON_RADIUS_XY))
	{
		return (FALSE);
	}
	return (TRUE);
};

// Tick principal. self == player.
void() Siphon_Tick =
{
	local entity veh;
	local entity cand;
	local float range;
	local float auto_radius;

	if ((time < self.siphon_next))
	{
		return;
	}
	self.siphon_next = (time + SIPHON_TICK);

	veh = self.enemy;
	if ((veh == world))
	{
		return;
	}
	range = Siphon_Range();

	// 1) Chatarra: si el jugador tiene UPG_SCRAP_AUTO, succiona en un
	//    radio mucho mayor sin cono. Si no, solo dentro del cono.
	if ((self.upgrades & UPG_SCRAP_AUTO))
	{
		auto_radius = 320;
	}
	else
	{
		auto_radius = SIPHON_RADIUS_XY;
	}
	cand = findradius(veh.origin, (range + 64));
	while (cand)
	{
		if ((cand.classname == "scrap_pickup"))
		{
			if (Siphon_InCone(veh, cand, range))
			{
				self.scrap = (self.scrap + 1);
				sound(veh, CHAN_ITEM, "items/itembk2.wav", 0.7, ATTN_NORM);
				remove(cand);
			}
			else
			{
				if ((self.upgrades & UPG_SCRAP_AUTO))
				{
					if ((vlen((cand.origin - veh.origin)) < auto_radius))
					{
						self.scrap = (self.scrap + 1);
						sound(veh, CHAN_ITEM, "items/itembk2.wav", 0.7, ATTN_NORM);
						remove(cand);
					}
				}
			}
		}
		cand = cand.chain;
	}

	// 2) Civiles: succiona cualquier civil dentro del cono.
	cand = findradius(veh.origin, (range + 64));
	while (cand)
	{
		if ((cand.classname == "civilian"))
		{
			if (Siphon_InCone(veh, cand, range))
			{
				if ((self.pax < PICKUP_CAPACITY))
				{
					self.pax = (self.pax + 1);
					// Siphoning a civilian is a PICKUP (it's now aboard, to be
					// delivered at the ship), not a delivery. Keep the field
					// and pickup bookkeeping straight: free its waiting slot
					// and decrement g_wave_left.
					if ((cand.civ_pickup != world) && (cand.civ_pickup.civ_alive > 0))
					{
						cand.civ_pickup.civ_alive = (cand.civ_pickup.civ_alive - 1);
					}
					Day_OnCivilianPickedUp();
					sound(veh, CHAN_ITEM, "items/r_item1.wav", 1, ATTN_NORM);
					remove(cand);
				}
			}
		}
		cand = cand.chain;
	}

	// 3) Munición (solo si UPG_SIPHON_AMMO está activo). Recoge backpacks
	//    enemigos en un radio amplio.
	if ((self.upgrades & UPG_SIPHON_AMMO))
	{
		cand = findradius(veh.origin, (range + 96));
		while (cand)
		{
			if ((cand.classname == "backpack"))
			{
				self.ammo_auto = (self.ammo_auto + 25);
				self.ammo_rock = (self.ammo_rock + 2);
				sound(veh, CHAN_ITEM, "items/ammo.wav", 0.7, ATTN_NORM);
				remove(cand);
			}
			cand = cand.chain;
		}
	}
};
