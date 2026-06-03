// hospital.qc — info_hospital + info_ship runtime support.
//
// Tres barcos + dos hospitales en tierra. Comparten lógica de "punto de
// descarga" pero difieren en valores:
//   barco (info_ship)      cap 12, 1 paciente / 10 s, +250 cr/pax
//   hospital (info_hospital) cap 6,  1 paciente / 4 s,  +400 cr/pax
//
// Estado per-entity en .hosp_pax / .hosp_cap / .hosp_rate /
// .hosp_next_release / .hosp_kind / .hosp_destroyed (ver defs.qc).
//
// info_ship es la base ya implementada en objectives.qc. Aquí añadimos
// hospital_init para configurarles los campos, hospital_release_tick
// para vaciarlos con el tiempo, y la lógica de derribo de hospitales en
// tierra que dispara Goliath cuando el día sube.

float HOSP_CAP_SHIP        = 12;
float HOSP_CAP_HOSPITAL    = 6;
float HOSP_RATE_SHIP       = 10;
float HOSP_RATE_HOSPITAL   = 4;
float HOSP_REWARD_SHIP     = 250;
float HOSP_REWARD_HOSPITAL = 400;

// Inicializa los campos comunes para un punto de descarga ya
// spawneado. classname diferenciado: "info_ship" o "info_hospital".
void(entity h, float is_hospital) Hospital_Init =
{
	if (is_hospital)
	{
		h.hosp_kind = 1;
		h.hosp_cap = HOSP_CAP_HOSPITAL;
		h.hosp_rate = HOSP_RATE_HOSPITAL;
	}
	else
	{
		h.hosp_kind = 0;
		h.hosp_cap = HOSP_CAP_SHIP;
		h.hosp_rate = HOSP_RATE_SHIP;
	}
	h.hosp_pax = 0;
	h.hosp_destroyed = 0;
	h.hosp_next_release = (time + h.hosp_rate);
};

// Llamada por objectives.qc cuando el jugador descarga civiles en este
// punto. Devuelve los créditos ganados (0 si está lleno o destruido).
float(entity h, float pax_count) Hospital_Receive =
{
	local float free_slots;
	local float taken;
	local float reward;

	if (h.hosp_destroyed)
	{
		return (0);
	}
	free_slots = (h.hosp_cap - h.hosp_pax);
	if ((free_slots <= 0))
	{
		return (0);
	}
	if ((pax_count > free_slots))
	{
		taken = free_slots;
	}
	else
	{
		taken = pax_count;
	}
	h.hosp_pax = (h.hosp_pax + taken);
	if (h.hosp_kind)
	{
		reward = (taken * HOSP_REWARD_HOSPITAL);
	}
	else
	{
		reward = (taken * HOSP_REWARD_SHIP);
	}
	return (reward);
};

// Llamada cada frame por hospital_think (registrado por Hospital_Init).
// Libera plazas conforme pasa el tiempo.
void() hospital_think =
{
	if (self.hosp_destroyed)
	{
		self.nextthink = (time + 1);
		return;
	}
	if ((time >= self.hosp_next_release))
	{
		if ((self.hosp_pax > 0))
		{
			self.hosp_pax = (self.hosp_pax - 1);
		}
		self.hosp_next_release = (time + self.hosp_rate);
	}
	self.nextthink = (time + 0.5);
};

// Marca un hospital como destruido. Llamada por el sistema de día cuando
// Goliath bombardea. Hospitales (no barcos) son vulnerables.
void(entity h) Hospital_Destroy =
{
	if ((h.hosp_kind == 0))
	{
		// Los barcos no pueden caer.
		return;
	}
	h.hosp_destroyed = 1;
	bprint("A field hospital has been destroyed.\n");
};
