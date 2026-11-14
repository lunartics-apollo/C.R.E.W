class_name CrewStats
extends RefCounted
## Health, energy and food for one crewmate (0-100). Energy and food drain with game time,
## faster when moving or working; running out of either slowly costs health. Only the
## crewmate you control drains: the others look after themselves.

const MAX := 100.0
const ENERGY_IDLE := 0.10      # per game minute
const ENERGY_MOVING := 0.22
const ENERGY_WORKING := 0.6
const FOOD_DRAIN := 0.09
const STARVE_DAMAGE := 0.35    # health per game minute while energy or food is empty
const REGEN := 0.03            # health per game minute while well fed and rested
const TIRED := 20.0
const LOW := 25.0

var health := MAX
var energy := MAX
var food := MAX

func tick(game_minutes: float, moving: bool, working: bool) -> void:
	var drain := ENERGY_WORKING if working else (ENERGY_MOVING if moving else ENERGY_IDLE)
	energy = maxf(0.0, energy - drain * game_minutes)
	food = maxf(0.0, food - FOOD_DRAIN * game_minutes)
	if energy <= 0.0 or food <= 0.0:
		health = maxf(0.0, health - STARVE_DAMAGE * game_minutes)
	elif energy > 50.0 and food > 50.0:
		health = minf(MAX, health + REGEN * game_minutes)

## Applies a spot's effects ({"energy": 35, ...}); returns the amounts actually gained.
func apply(effects: Dictionary) -> Dictionary:
	var gained := {}
	for key in effects:
		var before: float = get(key)
		var after := clampf(before + float(effects[key]), 0.0, MAX)
		set(key, after)
		gained[key] = after - before
	return gained

func is_tired() -> bool:
	return energy < TIRED

func speed_factor() -> float:
	return 0.75 if is_tired() else 1.0

func fainted() -> bool:
	return health <= 0.0

## The stat that most needs attention, or "" if all are fine.
func warning() -> String:
	var worst := ""
	var lowest := LOW
	for key in ["health", "energy", "food"]:
		if get(key) < lowest:
			lowest = get(key)
			worst = key
	return worst
