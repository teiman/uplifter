// minimap.qc — Hold-to-peek minimap camera.
//
// Bindings (AUTOEXEC.CFG):
//   alias +minimap "impulse 120"
//   alias -minimap "impulse 121"
//   bind m +minimap
//
// While the M key is held, the player's view origin is moved to the
// centre of the under-bedrock minimap capsule (geometry emitted by
// mapWriter.js' emitMinimap), looking straight down. Releasing the key
// restores the saved origin and angles.
//
// We don't move the helo entity (self.enemy) — only the player's view.
// The helo stays frozen at its real position so weapons / collisions /
// AI behave as if nothing happened. The look-only nature means the
// player can't fly around the minimap; it's a strict reference peek.

// Z constants must match modeditor/src/shared/types.js:
//   MINIMAP_TOP_Z       = -2240   (capsule ceiling)
//   MINIMAP_BOTTOM_Z    = -5312   (capsule floor / bedrock)
//   MINIMAP_SEA_Z       = -5296   (blue sea surface)
//   tile tops at MINIMAP_SEA_Z + 16 = -5280
//
// Place the camera near the ceiling so it stares down at the whole
// layout. With FOV 90 and ~3000u of headroom above the tile tops, the
// visible patch is ~6000×6000u — a generous slice of the playable
// area without forcing us to grow the capsule any further.
float MINIMAP_CAM_Z = -2280;

.float minimap_peeking;              // 1 while M is held
.vector minimap_saved_angles;        // restaurar al soltar M
.vector minimap_saved_vangle;
.float minimap_dbg_last_t;           // rate-limit del debug
.vector minimap_saved_pl_origin;     // player origin antes del peek
.float minimap_saved_pl_movetype;
.float minimap_saved_pl_solid;
.vector minimap_saved_heli_origin;
.vector minimap_saved_heli_angles;
.vector minimap_saved_heli_velocity;
.float minimap_saved_heli_movetype;
.float minimap_saved_heli_solid;
.float minimap_saved_heli_takedamage;
.float minimap_saved_heli_health;

// Cámara persistente que vive desde el worldspawn hasta el fin del
// nivel. Vive sola en el centro del minimap. Cuando se pulsa M, el
// servidor envía svc_setview apuntando a esta entidad; al soltar M, se
// envía svc_setview apuntando al chasecam normal del helo. NUNCA se
// destruye — eso garantiza que el handle sigue siendo válido durante
// toda la partida y no compite con Create_chasecam.
entity g_minimap_cam;

// Llamada UNA VEZ desde worldspawn (en world.qc). Spawnea la entidad,
// la mete en el minimap y la deja durmiendo a una posición arbitraria
// dentro de la cápsula. Su origen real se actualiza cuando empieza el
// peek.
void() Minimap_InitCam =
{
	if ((g_minimap_cam != world))
	{
		return;  // ya creada
	}
	g_minimap_cam = spawn();
	g_minimap_cam.classname = "minimap_cam";
	g_minimap_cam.movetype = MOVETYPE_NONE;
	g_minimap_cam.solid = SOLID_NOT;
	g_minimap_cam.view_ofs = '0 0 0';
	setmodel(g_minimap_cam, "progs/null.spr");
	setorigin(g_minimap_cam, ('0 0 0' + ('0 0 1' * MINIMAP_CAM_Z)));
	g_minimap_cam.angles = '90 0 0';
};

// Called from PlayerPreThink each frame. Assumes self == player.
//
// Reads self.impulse for 120 / 121 (set by the +/-minimap aliases).
// While `minimap_peeking` is true, the player's origin and v_angle are
// pinned to the minimap viewpoint each frame — that's what keeps the
// view there even though the player would otherwise drift back to the
// vehicle's origin via PlayerPostThink.
void() Minimap_TickPlayer =
{
	if ((self.impulse == 120))
	{
		if (!self.minimap_peeking)
		{
			self.minimap_peeking = 1;
			self.minimap_saved_angles = self.angles;
			self.minimap_saved_vangle = self.v_angle;
			self.minimap_saved_pl_origin = self.origin;
			self.minimap_saved_pl_movetype = self.movetype;
			self.minimap_saved_pl_solid = self.solid;
			if ((self.enemy != world))
			{
				self.minimap_saved_heli_origin = self.enemy.origin;
				self.minimap_saved_heli_angles = self.enemy.angles;
				self.minimap_saved_heli_velocity = self.enemy.velocity;
				self.minimap_saved_heli_movetype = self.enemy.movetype;
				self.minimap_saved_heli_solid = self.enemy.solid;
				self.minimap_saved_heli_takedamage = self.enemy.takedamage;
				self.minimap_saved_heli_health = self.enemy.health;
			}
			// Forzar la mirada hacia abajo. pitch -90 en Quake angles.
			msg_entity = self;
			WriteByte(MSG_ONE, 10);  // svc_setangle
			WriteAngle(MSG_ONE, 90);
			WriteAngle(MSG_ONE, 0);
			WriteAngle(MSG_ONE, 0);
		}
		self.impulse = 0;
	}
	else
	{
		if ((self.impulse == 121))
		{
			if (self.minimap_peeking)
			{
				self.minimap_peeking = 0;
				// Restaura player completo.
				setorigin(self, self.minimap_saved_pl_origin);
				self.angles = self.minimap_saved_angles;
				self.v_angle = self.minimap_saved_vangle;
				self.movetype = self.minimap_saved_pl_movetype;
				self.solid = self.minimap_saved_pl_solid;
				self.velocity = '0 0 0';
				self.view_ofs = '0 0 1';
				self.fixangle = TRUE;
				// Restaura helo (incluyendo takedamage y health por si
				// se redujo durante el peek a pesar de los safeguards).
				if ((self.enemy != world))
				{
					setorigin(self.enemy, self.minimap_saved_heli_origin);
					self.enemy.angles = self.minimap_saved_heli_angles;
					self.enemy.velocity = self.minimap_saved_heli_velocity;
					self.enemy.movetype = self.minimap_saved_heli_movetype;
					self.enemy.solid = self.minimap_saved_heli_solid;
					self.enemy.takedamage = self.minimap_saved_heli_takedamage;
					self.enemy.health = self.minimap_saved_heli_health;
				}
				// Restaura svc_setview al chasecam normal y ángulos.
				msg_entity = self;
				if ((self.oldenemy != world))
				{
					WriteByte(MSG_ONE, 5);   // svc_setview
					WriteEntity(MSG_ONE, self.oldenemy);
				}
				WriteByte(MSG_ONE, 10);  // svc_setangle
				WriteAngle(MSG_ONE, self.minimap_saved_vangle_x);
				WriteAngle(MSG_ONE, self.minimap_saved_vangle_y);
				WriteAngle(MSG_ONE, self.minimap_saved_vangle_z);
			}
			self.impulse = 0;
		}
	}
};

// Stub — el peek se hace ahora dentro de SetCameraPlace (en client.qc)
// para evitar la pelea con el resto de svc_setview del mod.  Lo dejamos
// declarado por si volvemos a necesitar lógica extra después del frame.
void() Minimap_PostThink =
{
};
