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

// Reparacion del heli posado en un punto de descarga. Cada HOSP_REPAIR_RATE
// segundos se restauran HOSP_REPAIR_AMOUNT puntos de health (sobre la salud
// absoluta del vehiculo, no el 0-100 del HUD), hasta max_health. Lento a
// proposito: recompensa quedarse, sin volver el barco en un boton de "full
// health" instantaneo.
float HOSP_REPAIR_RATE   = 0.5;   // un tic cada medio segundo
float HOSP_REPAIR_AMOUNT = 4;     // puntos de health por tic

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

// Repara poco a poco el vehiculo posado en un punto de descarga. Llamada
// desde ship_check para CADA heli posado dentro del radio. No repara puntos
// destruidos (un barco hundido / hospital bombardeado no cura). El ritmo lo
// marca veh.repair_next para que sea gradual aunque ship_check corra varias
// veces por segundo.
void(entity h, entity veh) Hospital_RepairVehicle =
{
	if (h.hosp_destroyed)
	{
		return;
	}
	if ((veh.health <= 0) || (veh.max_health <= 0))
	{
		return;   // destruido o sin max_health configurado
	}
	if ((veh.health >= veh.max_health))
	{
		return;   // ya a tope
	}
	if ((time < veh.repair_next))
	{
		return;
	}
	veh.repair_next = (time + HOSP_REPAIR_RATE);
	veh.health = (veh.health + HOSP_REPAIR_AMOUNT);
	if ((veh.health > veh.max_health))
	{
		veh.health = veh.max_health;
	}
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
