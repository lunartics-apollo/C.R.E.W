class_name CrewRoster
extends RefCounted
## The four crewmates you can switch between. Their story role decides which jobs
## only they can do (see "actor" in data/story.json).

const CREW := [
	{"id": "nova",  "name": "AISYAH",   "role": "PLANNER",  "color": Color("#e8843e")},
	{"id": "orion", "name": "JABU",     "role": "ENGINEER", "color": Color("#4e7ac8")},
	{"id": "juno",  "name": "SITI",     "role": "SCIENCE",  "color": Color("#60b878")},
	{"id": "kai",   "name": "LING",     "role": "COMMS",    "color": Color("#e6c046")},
]

const SPEAKERS := {
	"hamdan": "Minister Hamdan",
	"aisyah": "Director Aisyah",
	"jabu": "Chief Jabu",
	"ling": "Operator Ling",
	"siti": "Dr. Siti",
}

static func index_of(id: String) -> int:
	for i in CREW.size():
		if CREW[i].id == id:
			return i
	return -1

static func speaker_name(id: String) -> String:
	var index := index_of(id)
	return CREW[index].name if index >= 0 else SPEAKERS.get(id, id.capitalize())

const PROFILES := [
	{"speciality": "Launch, orbit & mission planning", "ability": "MISSION PLANNER: planning tasks are 25% faster.", "contribution": "Chooses the launch, orbit and budget reserve. Balances the team's priorities and checks readiness before launch."},
	{"speciality": "Spacecraft, power & mass", "ability": "SYSTEMS ENGINEER: engineering tasks are 25% faster.", "contribution": "Sizes the bus, solar array and battery. Manages propulsion, mass margins and spacecraft health in orbit."},
	{"speciality": "Forest imaging & science", "ability": "SCIENCE LEAD: science tasks are 25% faster.", "contribution": "Calibrates the imager and chooses useful instruments. Plans Sarawak observations within cloud, data and power limits."},
	{"speciality": "Radio links & data return", "ability": "SIGNAL SPECIALIST: communications tasks are 25% faster.", "contribution": "Chooses the radio and ground stations. Schedules passes and handles outages and rain so the forest data reaches home."},
]

static func sheet_path(id: String) -> String:
	return "res://assets/sprites/crew/%s.png" % id

static func portrait_path(id: String) -> String:
	return "res://assets/sprites/crew/%s_portrait.png" % id

static func icon_path(id: String) -> String:
	return "res://assets/sprites/crew/%s_icon.png" % id
