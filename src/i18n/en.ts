import type { Strings } from './strings'

export const en: Strings = {
  appName: 'Omertà',
  locale: 'en',
  languageName: 'English',

  roles: {
    // ---- The Family ----
    KILLER: { name: 'The Family', prompt: 'They choose their victim.' , brief: 'Each night you and the rest of the Family choose who dies. You win when the Family equals the town in numbers.' , detail: 'Each night the narrator wakes the whole Family together and you silently agree on one victim — point, nod, settle it without a word. By day you are citizens like anyone else: accuse, defend, steer suspicion elsewhere. You win the moment the Family equals everyone else left alive.' },
    CONVERT: {
      name: 'The Godfather',
      prompt: 'Decides whether to make the victim one of his own instead of killing them. Once only.',
      brief: 'Once in the whole game you can make your victim one of your own instead of killing them.',
      detail: 'You are part of the Family and wake with them every night. Once in the whole game, when the Family chooses a victim, you may raise your hand: instead of dying, that person becomes one of you, and the narrator tells them privately. Pick the moment carefully — there is only one.',
    },
    ROGUE: { name: 'The Renegade', prompt: 'Picks another victim — his own side included.' , brief: 'On even nights you pick a victim of your own, separate from the one the Family agrees on. It can be anyone in town, including one of your own.' , detail: 'You are part of the Family, but on even nights you also act alone: you choose a second victim, and it can be anyone — even another member of the Family. Use it to throw off suspicion or to clean house. On odd nights you act only with the others.' },
    PICK_SIDE: { name: 'The Associate', prompt: 'Decides which side he is on.' , brief: 'On the first night you secretly decide whether to join the Family or stay with the town. Whichever you pick, nobody else will know.' , detail: 'On the first night the narrator wakes you alone and you decide in secret: join the Family, or stay with the town? If you choose the Family, you wake with them from then on. Nobody else ever learns which you picked — not even at the end.' },

    // ---- The town ----
    PLAIN: { name: 'The Citizen', prompt: 'Sleeps.' , brief: 'You have no ability and are never woken at night. Your only weapon is the conversation: listen, question, and work out who is lying.' , detail: 'You have no special power and the narrator never wakes you at night. Your whole game happens by day: listen to who accuses whom, notice who changes their story, and vote with your head. The citizens win when nobody from the Family is left.' },
    INSPECT: { name: 'The Detective', prompt: 'Points at someone — show them that card.' , brief: 'Each night you pick someone and the narrator secretly shows you their card. Nobody else sees it, so you must convince them without proof.' , detail: 'Each night the narrator wakes you and you point at one person; they show you that card in secret and you go back to sleep. Nobody else sees it, so by day you must convince the others without being able to prove it. Be careful how soon you reveal yourself — the Family will come for you.' },
    GUARD: {
      name: 'The Bodyguard',
      prompt: 'Chooses who to protect. May pick himself, but never the same person two nights running.',
      brief: 'Each night you protect someone from dying. You may protect yourself, but never the same person two nights running.',
      detail: 'Each night you choose one person, and that night they cannot die, whatever happens. You may choose yourself, but never the same person two nights in a row. If you save someone, neither they nor the town will know — only you.',
    },
    MEDIC: {
      name: 'The Santera',
      prompt: 'Tell her who is about to die. She decides whether to spend the cure or the poison.',
      brief: 'You have two potions, each good for one use only: one saves whoever is about to die that night, the other kills anyone you choose.',
      detail: 'You have two potions, each good for a single use. Each night the narrator tells you who is about to die and you decide: spend the cure to save that person, spend the poison to kill someone else, or keep both. Once a potion is spent, it is gone.',
    },
    SURVIVE: { name: 'The Veteran', prompt: 'Survives the first attempt on his life.' , brief: 'You survive the first attempt on your life; the second one kills you. The town is never told the attempt failed, so only you will know.' , detail: 'The first attempt on your life fails: you wake up alive and the town is told nothing. Only you will know they came for you — and that is valuable information. The second attempt kills you, so do not get comfortable.' },
    SILENCE: { name: 'The Arsonist', prompt: 'Burns a house down — tomorrow they cannot speak or vote.' , brief: 'On odd nights you burn someone\'s house down — the next day they cannot speak or vote.' , detail: 'On odd nights the narrator wakes you and you choose a house to set alight. The next day that person cannot speak or vote, and the whole town knows it. Use it to silence whoever is doing the town most harm — or whoever suits you.' },
    EXTRA_VOTE: { name: 'The Snitch', prompt: 'Points at someone — tomorrow they carry an extra vote against them.' , brief: 'Each night you mark someone, and the next day they carry an extra vote against them.' , detail: 'Each night the narrator wakes you and you choose one person. The next day they carry an extra vote against them in the vote, and it is only announced if it turns out to be decisive. It is a quiet way to push the town toward whoever you suspect.' },
    PAIR: { name: 'The Binding', prompt: 'Ties two people together. If one falls, the other follows.' , brief: 'On the first night you tie two people together. If one of them dies, the other goes with them.' , detail: 'On the first night you choose two people and they are bound for good: if one dies, the other dies with them. The narrator tells both privately, and they learn who the other is. If you happen to bind someone from the town with someone from the Family, that pair wins together if they are the last two standing.' },
    PROTEGE: { name: 'The Orphan', prompt: 'Chooses a mentor. If the mentor is killed, he joins the Family.' , brief: 'On the first night you secretly choose a mentor. While they live you play with the town; if they are killed, you join the Family.' , detail: 'On the first night you secretly choose a mentor and the narrator notes it. While that person lives, you play with the town like anyone else. If they are killed, you join the Family that same night and wake with them from then on — and nobody else will know.' },
    SENSE: { name: 'The Bloodhound', prompt: 'Growls when a killer is sitting beside him.' , brief: 'Each morning the town is told whether a killer is sitting right beside you. It is never said which of your two neighbours it is.' , detail: 'You do nothing at night, but each morning the narrator tells the town whether a member of the Family is sitting right next to you. It never says which of your two neighbours it is. The seats at the table matter: move, and what you learn changes.' },
    AVENGE: { name: 'The Gunman', prompt: 'Takes someone with him when he dies.' , brief: 'When you die, you take someone down with you, and the choice is yours. It makes no difference how you fall — at night, or executed.' , detail: 'When you die, no matter how, you choose someone before you go and that person dies with you. The narrator will ask you at the moment. Think it over — it is your last move and it cannot be undone.' },
    MARTYR: { name: 'The Martyr', prompt: 'Wins if the town executes him.' , brief: 'You win on your own if you get the town to vote you out. Being killed at night does not count, so make yourself look guilty.' , detail: 'You win alone, on your own, if you get the town to execute you in a vote. Being killed at night does not count, and you lose. Your job is to look guilty without overdoing it: if nobody believes you, nobody votes for you.' },
    SWAP: { name: 'The Chameleon', prompt: 'Takes a spare card from the centre and changes role.' , brief: 'For the first three nights you may take a spare card from the centre and change role.' , detail: 'For the first three nights the narrator shows you the cards left over from the deal. You may take one and become that role from then on; the others learn which card vanished from the centre, but not who has it. From the fourth night you can no longer change.' },
    PEEK: { name: 'The Witness', prompt: 'Opens their eyes while the Family is awake.' , brief: 'You may crack your eyes open while the Family is awake, to see who they are. If you are caught looking, you are dead.' , detail: 'While the Family is awake and choosing, you may open your eyes a crack to see who they are. It is the most valuable information in the game — but if any member of the Family catches you looking, you die in the victim\'s place that night. Look little, and look well.' },
    SPLIT: { name: 'The Cultist', prompt: 'Splits the town into two factions.' , brief: 'On the first night you split the town into two opposing factions. Only you know who ended up on which side, and that secret is your edge.' , detail: 'On the first night you split the town into two factions, and the narrator tells each person privately which side they are on. Only you know the full list. How you use that secret is up to you and the table — it is a pure manipulation card.' },
  },

  phase: {
    nightFalls: 'The city sleeps',
    nightFallsBody: 'Everyone close your eyes.',
    townWakes: 'The city wakes!',
    townWakesBody: 'The town talks over what happened in the night.',
    quietNight: 'The night passed without incident.',
  },

  outcome: {
    death: (name, cause) => {
      switch (cause) {
        case 'killers':
          return `${name} was found dead this morning.`
        case 'rogue':
          return `${name} is dead too.`
        case 'poison':
          return `${name} was poisoned.`
        case 'lynch':
          return `The town executed ${name}.`
        case 'heartbreak':
          return `${name} could not bear the loss and followed their binding.`
        case 'revenge':
          return `${name} fell to the Gunman's last shot.`
      }
    },
    silenced: (name) => `${name}'s house was burned down — today they cannot speak or vote.`,
    extraVote: (name) => `${name} carries an extra vote against them today.`,
    growl: () => 'The bloodhound growled in the night.',
  },

  winner: {
    town: 'The town wins.',
    crew: 'The Family wins.',
    lovers: 'The bound pair win together.',
    martyr: 'The Martyr wins — the town walked into it.',
  },

  ui: {
    common: {
      next: 'Next',
      back: 'Back',
      done: 'Done',
      cancel: 'Cancel',
      undo: 'Undo',
      restart: 'Restart',
      confirm: 'Confirm',
      close: 'Close',
    },
    setup: {
      howMany: 'How many players?',
      whoIsPlaying: 'Who is playing?',
      addName: 'Add',
      addHint: 'Type a name and hit Enter. One after another.',
      minPlayers: (n) => `You need at least ${n} players`,
      namesReady: (n) => `${n} players. Let’s go`,
      clearNames: 'Clear the list',
      clearConfirm: 'Sure? This removes every name.',
      remove: 'Remove',
      players: 'Players',
      namePlaceholder: 'Name',
      rolePlaceholder: 'Pick a role',
      tapToEdit: 'Tap a player to edit them',
      save: 'Save',
      start: 'Deal the roles',
      incomplete: 'Some players still need a role',
      duplicateRoleHint: 'Repeating roles and names is fine',
      dealRandom: 'Deal at random',
      complexity: 'Complexity',
      simple: 'Simple',
      standard: 'Standard',
      complex: 'Advanced',
      editRoles: 'View and adjust roles',
      rearrange: 'Rearrange seats',
      rearrangeHint: 'Tap two people to swap them',
      rearrangeDone: 'Seats done',
      moveLeft: '◀ Move',
      moveRight: 'Move ▶',
    },
    reveal: {
      passTo: (name) => `Pass the phone to ${name}`,
      areYou: (name) => `Are you ${name}?`,
      shieldScreen: 'Make sure nobody else can see the screen.',
      holdToReveal: 'Press and hold to see your role',
      keepHolding: 'Keep holding',
      yourRole: 'Your role',
      teamTown: 'You are with the town',
      teamCrew: 'You are with the Family',
      sideTown: 'They are with the town',
      sideCrew: 'They are with the Family',
      released: 'Hidden. Hand the phone back.',
      allSeen: 'Everyone has seen their role',
      beginFirstNight: 'Begin the first night',
      showAgain: 'Show a role again',
      doneViewing: 'Done — pass the phone',
      pickPlayer: 'Who needs to see it?',
      hasQuestion: 'I have a question',
      hasQuestions: 'Want to ask something',
      questionMarked: 'Noted. The narrator will check with you privately.',
      questionsRound: 'Questions before we start',
      questionsIntro: 'These players have a question about their role. Show each their card privately, one at a time.',
      showRoleTo: (name) => `Show ${name} their role`,
      clearFlag: 'All clear now',
    },
    night: {
      stepCounter: (current, total) => `${current} of ${total}`,
      noOne: 'No one',
      heal: 'Heal',
      poison: 'Poison',
      pickOne: 'Choose who',
      pickTwo: 'Choose two',
      endNight: 'End the night',
      wakeGroup: 'Wake them together.',
      asCircle: 'Show the circle',
      asList: 'Show a list',
    },
    day: {
      report: 'What happened in the night',
      whoDies: 'Who does the town execute?',
      nobody: 'Nobody dies today',
      nextNight: 'Night falls',
      silencedToday: (name) => `${name} cannot speak or vote today`,
    },
    over: {
      title: 'Game over',
      playAgain: 'Play again',
      finishNow: 'End the game',
      history: 'The whole game',
    },
    menu: {
      more: 'More',
      language: 'Language',
      layout: 'Pick people from',
      circle: 'The circle',
      list: 'A list',
      restartConfirm: 'Start over? This forgets the current game. The names are kept.',
      endGameConfirm: 'End the game now? You will see the summary and cannot resume play.',
    },
    timeline: {
      title: 'Everything that happened',
      open: 'Timeline',
      revertHere: 'Rewind to here',
      nightStart: (n) => `Night ${n}`,
      nightEnd: (n) => `Morning after night ${n}`,
      lynch: (name) => `The town executes ${name}`,
      hunterShot: (name) => `The Gunman shoots ${name}`,
      skipped: (role) => `${role}: no action`,
      chose: (role, name) => `${role} picks ${name}`,
      pairedUp: (role, a, b) => `${role} ties ${a} and ${b}`,
      potion: (role, name, kind) => `${role} uses ${kind} on ${name}`,
      acted: (role) => `${role} acts`,
    },
  },
}
