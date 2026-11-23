# Player Evaluation — the Volume Lens

> **Volume is the holy grail.** Talent, efficiency and upside only pay off if the
> ball keeps coming. Every RB, WR and TE gets evaluated by asking two questions,
> in this order:
>
> 1. **How will this player get high volume?**
> 2. **What threatens that volume?**
>
> Those two questions set the **volume** adjustment, the big lever. Offense
> quality and individual skill are separate, smaller adjustments (§4). **Always
> show each factor on its own beside the net.** Never report just the net, or a
> volume call can't be told apart from an offense or skill call.

---

## 1. Running backs

RBs are where this matters most. A backfield split cuts a back's volume, and so
his value, more than anything else can.

### 1a. Path to volume: what earns a premium

| Signal | What counts | Weight |
| --- | --- | --- |
| **Track record of handling volume** | Has actually carried a workhorse load before: a season of ~250+ touches, or ~15+ touches/game over a meaningful stretch | **Highest.** Proven > projected |
| **Team evidence** | The coaching staff has fed him like a workhorse for multiple seasons, even with a talented backup on the roster (James Cook in BUF) | **Highest.** Tops the Clear range |
| **No threat behind him** | The backups are no-name or unproven | High |
| **Three-down role** | Plays passing downs and goal line as well as early downs, so his touches aren't capped by game script | High |

### 1b. Threats to volume: discount HEAVILY

| Threat | Example shape | Severity |
| --- | --- | --- |
| **Unproven starter + any competent competition** | No track record of his own AND a solid backup or a rookie the team likes (Hampton, Jeanty) | **Severe** |
| **Unproven starter + vet with a track record** | Love beside Allgeier | **Severe** |
| **A "1B" back** | A second back who gets 30-40% of the work (Breece Hall beside Braelon Allen) | **Severe** |
| **Highly drafted rookie** (Rd 1-2) | Even with no NFL track record, draft capital buys a rookie a role | **Severe** |
| **Named committee / coach talk** | "1A/1B", "hot hand", "we'll ride both" | Severe |
| **Proven starter + vet backup with a track record** | Chase Brown beside Samaje Perine, Bucky Irving beside Kenny Gainwell | **Significant**: the vet takes a real share even behind a proven starter |
| **Emerging backup** | A young backup whose role is growing (Kyren Williams beside Blake Corum) | Moderate |
| **Role carve-outs** | A dedicated 3rd-down back or goal-line vulture | Moderate |

**NOT volume threats:**
- **No-name or unproven backups**, even if one turns out to be a surprise
  rookie. You can't price in what wasn't knowable. Kaelon Black did eat into
  CMC's work, but Kenneth Walker had the same setup and kept his volume.
- **Injury history.** A healthy workhorse is still a workhorse (Achane). Note
  it in the explanation, but keep it out of the volume number.

**Backup rule of thumb:** a backup with *no* track record is **not** a threat.
The exception is a **highly drafted rookie**, who is a threat on draft capital
alone.

**Severity depends on the starter.** The same backup is a different threat
behind different starters. Allgeier sat behind Bijan Robinson for years, and
Bijan held 300+ touches anyway. Put Allgeier beside a rookie with no track
record and the split is a coin flip.

### 1c. Lessons from 2026: two opposite mistakes

| Player | What I did | What the rubric says |
| --- | --- | --- |
| **Jeremiyah Love** (ARI) | Drafted him | **Avoid.** Rookie, no track record, sharing the backfield with Tyler Allgeier, a vet with a volume track record: **Contested** |
| **Javonte Williams** (DAL) | Passed on him | **Draft.** Proven volume, no backup worth mentioning: **Clear path** |

Both mistakes come from the same place: the price followed the player instead
of the player's **volume situation**.

---

## 2. Wide receivers *(draft, to refine in a later test drive)*

### Path to volume
- **Target-share track record**: has commanded a large share of targets before
  (~25%+ is alpha territory).
- **Route participation**: on the field for nearly every dropback. A part-time
  route runner can't earn volume.
- **Team pass volume**: a pass-heavy team, or a bad defense that forces it to
  throw from behind.
- **Clear #1 role**, with no co-alpha to split targets with.

### Threats to volume
- **Target competition**: another alpha WR, a target-hog TE, or a pass-catching RB.
- **New arrivals**: a highly drafted rookie WR, or a big free-agent signing.
- **QB change or downgrade**: fewer catchable targets, or fewer attempts.
- **Run-first scheme**, or a team expected to sit on leads.

---

## 3. Tight ends *(draft, to refine in a later test drive)*

### Path to volume
- **Target-share track record**, judged against other TEs, not WRs.
- **Route runner, not a blocker**: high route participation, splits out wide or
  in the slot.
- **Thin WR room**, so targets flow to the TE by default.
- **Red-zone role.**

### Threats to volume
- **Second TE who plays** (two-TE sets split the routes), or a rookie TE drafted
  high.
- **Deep WR room** soaking up targets.
- **Blocking-first usage**: on the field, but not running routes.
- **QB change.**

---

## 4. Subranking: offense and skill

These are separate from volume and deliberately smaller. Show them in their own
columns.

| Factor | Question | Example |
| --- | --- | --- |
| **Offensive quality** | Is the offense or QB bad enough to waste the volume? Volume on a bad offense means fewer drives, fewer red-zone trips and more stacked boxes | **Tony Pollard (TEN), 2026:** a bad offense made him bad for most of the early season. When his handcuff got hurt (more volume) and the offense improved, he was very good |
| **Individual skill** | Does he turn touches into more than the volume alone would? | **De'Von Achane:** rare skill. Healthy, he outproduces his touch count |

---

## 5. The adjustments

Three independent numbers, each a % of the projected price
(`override_price || projected_price`). Positive is a premium, negative a
discount. **Net = Volume + Offense + Skill.** Always show all three beside the
net.

### Volume (the big lever)

Each verdict is a **range**. Where a player lands inside it depends on how
strong the evidence is.

| Verdict | Range | Meaning | Why that size |
| --- | --- | --- | --- |
| **Clear path** | **+5 to +15%** | Proven volume, no real threat. Multi-year team evidence (Cook) tops the range | Volume is the scarce thing. Pay up rather than lose the player by a dollar (the Javonte mistake) |
| **Minor threat** | **0 to −10%** | A moderate threat: an emerging backup, a role carve-out | The floor is intact, but some of the ceiling leaks away |
| **Significant threat** | **−15 to −25%** | A proven starter beside a vet backup with a track record (Perine, Gainwell) | The vet gets real work whatever the depth chart says |
| **Contested** | **−30 to −40%** | A severe threat: an unproven starter beside any competent back, a 1B back, a Rd 1-2 rookie, a named committee | A split roughly halves the touches. You aren't paying for him to win the job (the Love mistake) |
| **No path** | **−60%** | No believable route to volume | Bench dart only |

### Offense and skill (the small levers)

| Factor | Good | Average | Bad | Why asymmetric |
| --- | --- | --- | --- | --- |
| **Offense / QB** | +5% | 0 | **−10%** | A bad offense actively wastes volume (Pollard). A good one only adds a little on top of it |
| **Individual skill** | +5% (elite) | 0 | −5% | Skill amplifies volume, but it can't create it |

---

## 6. Per-player template

```
### <Player> — <POS>, <TEAM>
Path to volume:  <track record / role / team evidence>
Threats:         <who/what, and how severe>
Volume:          <verdict>   <adj>%
Offense:         good | average | bad        <adj>%
Skill:           elite | average | limited  <adj>%
Net:             <sum>%   →   $<projected> → $<adjusted>
```

---

## 7. Test drive: 2026 top-20 RBs (draft-day view)

The order and prices come from the local DB (`adp_formatted`, effective source
`fpros`; projected price as stored). Volume numbers are **round 2**, calibrated
from your review. Offense and skill are unchanged from round 1 and **not yet
reviewed**: your round-1 feedback was given against the old nets, read as
volume.

| ADP | Player | Team | Proj $ | Volume verdict | **Vol** | **Off** | **Skill** | **Net** | Adj $ | Volume explanation |
| --: | --- | --- | --: | --- | --: | --: | --: | --: | --: | --- |
| 1 | Jahmyr Gibbs | DET | 72 | Clear | +10 | +5 | +5 | +20 | 87 | Backups are no-name guys |
| 2 | Bijan Robinson | ATL | 67 | Minor | −5 | 0 | +5 | 0 | 67 | Vet backup (Robinson Jr.), but Bijan has held volume beside that kind of back |
| 7 | Jonathan Taylor | IND | 55 | Clear | +10 | 0 | 0 | +10 | 60 | Proven workhorse, nobody behind him |
| 8 | Christian McCaffrey | SF | 52 | Minor | 0 | +5 | +5 | +10 | 57 | Proven. Kaelon Black's share was a surprise that wasn't knowable on draft day; age keeps him off Clear |
| 9 | James Cook III | BUF | 52 | Clear | +15 | +5 | 0 | +20 | 62 | The perfect setup: a talented, draftable handcuff the Bills never feed. Years of workhorse usage |
| 12 | Chase Brown | CIN | 47 | Significant | −15 | +5 | 0 | −10 | 42 | Samaje Perine (vet, track record) took real work. Knowable, and under-priced on draft day |
| 13 | Saquon Barkley | PHI | 46 | Minor | 0 | +5 | +5 | +10 | 50 | *Not reviewed.* Held at the 0 you saw: proven, with Bigsby behind him |
| 16 | De'Von Achane | MIA | 41 | Clear | +10 | −10 | +5 | +5 | 43 | Fair bet as a workhorse; his backups were unproven on draft day. Injury is noted, not priced |
| 17 | Omarion Hampton | LAC | 40 | Contested | −30 | +5 | 0 | −25 | 30 | Unproven himself, with solid backups. Mostly his own lack of a track record |
| 19 | Kenneth Walker III | KC | 38 | Clear | +10 | +5 | 0 | +15 | 44 | Competition was an unproven rookie |
| 21 | Derrick Henry | BAL | 34 | Clear | +15 | +5 | 0 | +20 | 41 | The definition of volume, no backup of note |
| 23 | Ashton Jeanty | LV | 32 | Contested | −30 | −10 | +5 | −35 | 21 | Unproven, plus a rookie RB the team liked |
| 31 | Kyren Williams | LAR | 24 | Minor | −5 | +5 | 0 | 0 | 24 | Proven workhorse with an emerging backup (Corum) |
| **32** | **Javonte Williams** | DAL | 23 | **Clear** | **+15** | +5 | 0 | +20 | 27 | **The 2026 miss.** Proven volume, no backup worth mentioning |
| 34 | Breece Hall | NYJ | 21 | Contested | −30 | −10 | +5 | −35 | 13 | Braelon Allen is a 1B who gets 30-40% of the work |
| **40** | **Jeremiyah Love** | ARI | 18 | **Contested** | **−40** | −10 | +5 | −45 | 10 | **The 2026 mistake.** Rookie, no record, beside Allgeier (vet, volume record) |
| 43 | Travis Etienne Jr. | NO | 16 | Significant | −20 | −10 | 0 | −30 | 11 | Proven, but Kamara still has a role |
| 45 | D'Andre Swift | CHI | 16 | Significant | −25 | +5 | 0 | −20 | 12 | Monangai earned a share, softened by Swift's strong track record |
| 50 | Bucky Irving | TB | 13 | Minor | −10 | +5 | +5 | 0 | 13 | Gainwell's track record knocks him down a bit |
| 52 | Cam Skattebo | NYG | 12 | Significant | −20 | 0 | +5 | −15 | 10 | Weak competition, but a shaky track record of his own |

### What round 1 changed in the rubric

- **The starter's own track record matters most.** Hampton and Jeanty are
  Contested mainly because they're unproven, not because of who's behind them.
- **No-name backups aren't threats,** even when one surprises (Black vs. CMC
  hurt, Walker's rookie didn't). Gibbs, Walker and Achane moved to Clear.
- **Team evidence tops the Clear range** (Cook).
- **A 1B back is Contested** (Hall).
- **A vet backup with a track record is a Significant threat even behind a
  proven starter.** This is a new tier between Minor and Contested (Brown,
  Etienne, Swift, Skattebo, plus Irving at the Minor edge).
- **Injury history is a note, not a volume discount.**

### Still open

1. **Review offense and skill.** They now sit in their own columns, so they can
   be judged on their own.
2. **Saquon** wasn't in your feedback. His volume is held at 0.
3. **Unverified facts:** team assignments come from the DB, but my backfield
   reads are from memory. The DB has no volume stats after 2024, and its team
   rankings are unset.
