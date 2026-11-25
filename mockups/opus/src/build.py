"""Curate a real slice of the Readwise library + hand-authored relations
(stand-in for the build-time LLM pass) and inject into the mockup templates."""
import json, re, sys, pathlib

SP = pathlib.Path(__file__).parent
OUT = pathlib.Path("/Users/hugoahlberg/.t3/projects/readwising/mockups/opus")

hs = {}
for p in range(1, 6):
    for h in json.load(open(SP / f"hl{p}.json"))["results"]:
        hs[h["id"]] = h

THEMES = {
    "AGENCY": (-0.55, 0.38), "ACTION": (0.05, 0.62), "TRADITION": (0.62, 0.42),
    "ENOUGH": (-0.62, -0.30), "UNCERTAINTY": (0.40, -0.05), "ATTENTION": (0.66, -0.52),
    "EQUANIMITY": (-0.10, -0.58), "PERCEPTION": (0.05, 0.05),
}

H = [  # key, readwise id, theme
    ("a1", 1000655420, "AGENCY"), ("a2", 1043102942, "AGENCY"), ("a3", 1000655421, "AGENCY"),
    ("a4", 1026759958, "AGENCY"), ("a5", 1055636496, "AGENCY"), ("a6", 1000655416, "AGENCY"),
    ("a7", 1000655419, "AGENCY"), ("a8", 1000655424, "AGENCY"), ("a9", 1047171520, "AGENCY"),
    ("a10", 1026759945, "AGENCY"),
    ("b1", 1073252822, "ACTION"), ("b2", 1026759948, "ACTION"), ("b3", 1063294679, "ACTION"),
    ("b4", 987603997, "ACTION"), ("b5", 1055636482, "ACTION"), ("b6", 1037536433, "ACTION"),
    ("b7", 1011471843, "ACTION"), ("b8", 987603993, "ACTION"), ("b9", 1037536441, "ACTION"),
    ("b10", 1032236072, "ACTION"),
    ("c1", 1055636490, "TRADITION"), ("c2", 980358188, "TRADITION"), ("c3", 1029721245, "TRADITION"),
    ("c4", 1026759956, "TRADITION"), ("c5", 1055636497, "TRADITION"), ("c6", 1067352985, "TRADITION"),
    ("c7", 1055636489, "TRADITION"), ("c8", 1042558086, "TRADITION"), ("c9", 1055636479, "TRADITION"),
    ("d1", 1019625029, "ENOUGH"), ("d2", 1011471841, "ENOUGH"), ("d3", 987603992, "ENOUGH"),
    ("d4", 1024942533, "ENOUGH"), ("d5", 1073251583, "ENOUGH"), ("d6", 1073251590, "ENOUGH"),
    ("d7", 1021764582, "ENOUGH"), ("d8", 1026759955, "ENOUGH"), ("d9", 1024942536, "ENOUGH"),
    ("d10", 1055636486, "ENOUGH"),
    ("e1", 1031714351, "UNCERTAINTY"), ("e2", 1032236071, "UNCERTAINTY"), ("e3", 1037536440, "UNCERTAINTY"),
    ("e4", 978030847, "UNCERTAINTY"), ("e5", 1019625021, "PERCEPTION"), ("e6", 1066993121, "PERCEPTION"),
    ("e7", 1043100290, "PERCEPTION"), ("e8", 971594557, "PERCEPTION"), ("e9", 1073253431, "PERCEPTION"),
    ("e10", 1019625022, "PERCEPTION"),
    ("f1", 1041095748, "ATTENTION"), ("f2", 1019048734, "ATTENTION"), ("f3", 1063294677, "ATTENTION"),
    ("f4", 976268135, "ATTENTION"), ("f5", 1021764588, "ATTENTION"), ("f6", 1019048730, "ATTENTION"),
    ("g1", 1011471839, "EQUANIMITY"), ("g2", 1067796572, "EQUANIMITY"), ("g3", 987603990, "EQUANIMITY"),
    ("g4", 983023270, "EQUANIMITY"), ("g5", 1050818463, "EQUANIMITY"), ("g6", 1019048732, "EQUANIMITY"),
    ("g7", 987603995, "EQUANIMITY"), ("g8", 1033679544, "EQUANIMITY"),
    ("h1", 954875631, "UNCERTAINTY"), ("h2", 960430237, "PERCEPTION"), ("h3", 960429591, "PERCEPTION"),
]

# stance: echo | extend | complicate | contradict.  why, and for push-back: "both true if"
E = [
    ("a1", "a2", "echo", "Both locate the failure in waiting to be rescued. Vance names it as a culture; Hall treats it as a habit you can break."),
    ("a1", "a3", "contradict", "Vance blames missing agency, then concedes in the same book that networks beat both luck and merit.",
     "agency gets you to the door, and the network decides whether it opens."),
    ("a1", "a5", "contradict", "Durant treats concentration as a structural law of complex economies, not a failure of individual will.",
     "individuals can beat the trend while the trend still holds on average."),
    ("a1", "a8", "extend", "Same book, the prescription: stop outsourcing blame to presidents and faceless companies."),
    ("a1", "g3", "echo", "A first-century Stoic and an Appalachian memoir reach the same diagnosis: blame is a way of handing away control."),
    ("a2", "a9", "extend", "The fictitious-versus-real barrier distinction is the operating manual for naming problems out loud."),
    ("a2", "a6", "complicate", "The Yale professor is humbler. You probably can't fix it; you can only put a thumb on the scale.",
     "you act fully on what's in reach and expect the system to move by inches."),
    ("a3", "a4", "extend", "Qureshi's answer to 'networks beat merit': manufacture luck by increasing your surface area."),
    ("a4", "a10", "echo", "Asking more is how surface area grows. Being fine with 'no' is the cost of entry."),
    ("a9", "a10", "echo", "Two writers, one move: make reality say no instead of saying it for yourself."),
    ("a7", "a3", "complicate", "Mamaw's 'you can do anything' sits right beside Vance's own evidence that who you know decides a lot.",
     "believing in agency is useful precisely because it isn't entirely accurate."),
    ("a5", "c7", "echo", "Durant twice: history is indifferent to fairness."),
    ("b1", "b2", "echo", "Two lists, one rule: bias toward the next step, not the perfect plan."),
    ("b2", "b3", "echo", "Research is a respectable-looking form of resistance."),
    ("b2", "b4", "contradict", "Epictetus asks for a deliberate pause to trace consequences before acting.",
     "speed is for reversible decisions and deliberation for irreversible ones."),
    ("b2", "b5", "contradict", "If the downside is ruin, no amount of speed or upside justifies the bet.",
     "you move fast inside a strategy that can't kill you."),
    ("b1", "b6", "extend", "Why good-enough works: hard decisions inflate their own importance until they stall you."),
    ("b6", "b7", "echo", "Marcus Aurelius anticipated decision-fatigue research by 1,800 years: attention should match its object."),
    ("b6", "b10", "echo", "Parkinson's Law of Triviality is the same loop seen from the outside."),
    ("b8", "b2", "extend", "Being willing to bumble is the emotional precondition for doing things fast."),
    ("b9", "b4", "complicate", "Kierkegaard puts a ceiling on deliberation: you only understand a decision after you've lived it.",
     "you plan to the point of diminishing returns, then let the doing teach you."),
    ("b4", "b5", "echo", "Both demand you trace the chain of consequences before committing."),
    ("b3", "f4", "extend", "Mantel explains why more information isn't the cure: information is not knowledge."),
    ("c1", "c2", "contradict", "Durant: no single mind can safely dismiss inherited customs. Shaw: all progress depends on the one who refuses to adapt.",
     "most unreasonable people are wrong, and the few who aren't are why progress happens. Durant is describing the base rate; Shaw is describing the tail."),
    ("c1", "c3", "contradict", "Dissent as the engine of progress, against custom as the accumulated result of experiment.",
     "customs are the record of past dissents that survived."),
    ("c1", "c5", "extend", "Religion is Durant's clearest case of a custom carrying generational wisdom."),
    ("c5", "c6", "echo", "A 1968 historian and an MIT economist make the same claim: church as habit infrastructure."),
    ("c2", "c4", "echo", "Plant the flag, and let the world adapt to you."),
    ("c3", "e9", "extend", "Kindness is what lets dissent be heard instead of punished."),
    ("c7", "c8", "echo", "What survives defines 'good': Durant on civilizations, evolutionary psychology on moral instincts."),
    ("c8", "c3", "extend", "If both political instincts survived evolution, silencing either side throws away an adaptation."),
    ("c9", "c4", "extend", "Taleb explains where the approval-seeking came from: norms designed to domesticate."),
    ("c1", "c9", "contradict", "Taleb reads custom as domestication by the powerful, not as distilled wisdom.",
     "a custom can encode wisdom and serve power at the same time."),
    ("d1", "d3", "echo", "Housel's equation is Epictetus' advice with a minus sign."),
    ("d1", "d2", "echo", "Use comfort when it's there and don't miss it when it isn't. Wanting little, from the emperor's side."),
    ("d1", "c2", "contradict", "Shaw's unreasonable man never lowers his wants. That's the whole point.",
     "you're content with things and unreasonable about work."),
    ("d3", "d10", "contradict", "Taleb ranks courage, meaning risk-taking, as the highest virtue. Epictetus counsels reining desire in.",
     "you restrain your desire for outcomes and keep the courage for the attempt."),
    ("d4", "d1", "complicate", "Perkins warns that too much restraint wastes the only resource that doesn't renew.",
     "you want little, but spend on what you do want while you can still enjoy it."),
    ("d4", "d5", "echo", "A fun-money account is Die with Zero in miniature."),
    ("d6", "d7", "echo", "The same law at two scales: the first three bites, the occasional treat."),
    ("d7", "d1", "extend", "Keep wants low and every treat registers as a surplus."),
    ("d8", "b2", "echo", "Speed as a stance on life, not just on tasks."),
    ("d8", "d3", "complicate", "Leaning into every new thing can be desire wearing curiosity's clothes.",
     "curiosity is aimed at what's in your control: learning, not acquiring."),
    ("d9", "b5", "echo", "Taleb twice: fragility scales with what you fear losing, and ruin can't be offset."),
    ("d9", "d10", "complicate", "The same author calls courage the highest virtue, yet says fragility grows with what you stand to lose.",
     "you keep what you have to lose small, so you can afford to be brave."),
    ("e1", "e2", "echo", "Holding contradictory ideas at once, from two directions."),
    ("e1", "e3", "complicate", "Kelly says prepare for unprecedented uncertainty. Kyle says 'this time is different' are the four most dangerous words.",
     "you assume it's the same until evidence forces otherwise, then update fast."),
    ("e3", "e4", "contradict", "An engineer with 15 years of code argues this time really is different: execution is no longer the moat.",
     "base rates win most of the time, and the costly errors are the rare times they don't."),
    ("e4", "h1", "contradict", "Wang shows execution, the factory floor, is exactly where China's innovation lives.",
     "AI commoditizes software execution while physical execution stays scarce."),
    ("e5", "e6", "echo", "Rationalizing, not rational. Comfort before truth."),
    ("e6", "e7", "extend", "Hall turns Russell's observation into a question you can actually ask yourself."),
    ("e7", "e8", "extend", "A worked example: a German economist conceding a point to a politician he plainly dislikes."),
    ("e10", "e5", "echo", "Beliefs follow geography, and the reasons arrive afterward."),
    ("e10", "c1", "complicate", "If consensus is mostly geography, inherited customs may encode location more than wisdom.",
     "local customs are wise locally, and only there."),
    ("e2", "c2", "echo", "The unreasonable idea is often just the opposite idea, tried."),
    ("f1", "f2", "echo", "The mind as a garden with a gate, built for analog inputs."),
    ("f1", "c3", "contradict", "Mastroianni curates what gets in. The dissent argument says exposure to the other side is the point.",
     "you keep out the noise, not the opponents."),
    ("f3", "f4", "echo", "Knowledge outruns wisdom; information isn't knowledge. Same gradient."),
    ("f5", "f1", "echo", "Old books, nature and religion as filters on what gets into your head."),
    ("f6", "f1", "extend", "Why filtering beats refuting: nonsense is cheaper to produce than to clean up."),
    ("f5", "c1", "echo", "Perell's way out of culture runs through tradition: old books and religion."),
    ("g1", "g2", "echo", "A Roman emperor and an F-16 pilot on 9/11: attend to what you must do, not to what you feel."),
    ("g1", "g6", "complicate", "Saunders asks you to open up to whatever makes you kinder. Marcus asks you to stop caring what they think.",
     "you detach from opinion, not from people."),
    ("g3", "a8", "echo", "Epictetus and Vance land on the same move: drop the blame, keep the agency."),
    ("g4", "g5", "echo", "Old injuries keep frightening us long after they could hurt us."),
    ("g4", "g7", "extend", "The Stoic cure for imagined suffering is to look straight at the real kind."),
    ("g8", "g1", "echo", "Stewing over an insult hands the other person the controls."),
    ("g2", "g6", "contradict", "Penney's emotional shutdown made her effective. Saunders treats openness as the thing that matters most.",
     "you shut down for the crisis and open up for the life."),
    ("h2", "h3", "echo", "Even the inner screen isn't standard equipment."),
    ("h3", "e10", "extend", "Consensus realities go all the way down, to how each of us experiences a thought."),
    ("h1", "b9", "extend", "Learning by doing at industrial scale: understanding arrives after production, not before."),
]

def clean(t):
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)
    t = re.sub(r"\[\d+\]\(private://[^)]+\)", "", t)
    return re.sub(r"\s+", " ", t).strip()

CAT = {"books": "BK", "supplementals": "BK", "articles": "AR", "tweets": "TW", "podcasts": "PD"}
AUTH_FIX = {"Last accessed on": "Unknown author", "Scott, James C.;": "James C. Scott", "Kean, Leslie": "Leslie Kean"}

VOICE = {"c2":"George Bernard Shaw","b3":"Russ Roberts","f3":"Isaac Asimov","f6":"Alberto Brandolini",
  "e6":"Bertrand Russell","e2":"Rory Sutherland","d4":"Bill Perkins","d9":"Nassim Taleb","e5":"Billy Markus",
  "e10":"David McRaney","f2":"Krista Tippett","f4":"Hilary Mantel","g6":"George Saunders","f5":"David Perell",
  "b10":"C. Northcote Parkinson","b9":"Søren Kierkegaard"}
import random
random.seed(7)
items = []
for k, rid, th in H:
    h = hs[rid]
    cx, cy = THEMES[th]
    items.append(dict(
        id=k, rw=rid, text=clean(h["text"]), note=h.get("note") or "",
        src=h["book_title"], au=AUTH_FIX.get(h["book_author"], h["book_author"]),
        cat=CAT.get(h["book_category"], "AR"), theme=th,
        date=(h.get("highlighted_at") or "")[:10], voice=VOICE.get(k),
        x=round(cx + random.gauss(0, 0.085), 4), y=round(cy + random.gauss(0, 0.085), 4),
    ))
keys = {i["id"] for i in items}
edges = []
for e in E:
    a, b, s, why = e[:4]
    assert a in keys and b in keys, e
    edges.append(dict(a=a, b=b, s=s, why=why, both=e[4] if len(e) > 4 else None))

# pull a cross-theme pull on positions so bridges read on the map
data = dict(total=7252,
            themes={k: list(v) for k, v in THEMES.items()}, items=items, edges=edges)
js = "window.COMMONPLACE = " + json.dumps(data, ensure_ascii=False) + ";"
OUT.mkdir(parents=True, exist_ok=True)
for tpl in sorted(SP.glob("tpl-*.html")):
    html = tpl.read_text().replace("/*__DATA__*/", js)
    (OUT / tpl.name.replace("tpl-", "")).write_text(html)
    print("wrote", OUT / tpl.name.replace("tpl-", ""))
print(len(items), "items", len(edges), "edges",
      sum(e["s"] in ("complicate", "contradict") for e in edges), "push-backs")
