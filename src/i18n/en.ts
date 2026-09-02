import type { Strings } from './strings'

export const en: Strings = {
  appName: 'Omertà',
  locale: 'en',
  languageName: 'English',

  roles: {
    // ---- The Family ----
    KILLER: { name: 'The Family', prompt: 'They choose their victim.' , brief: 'Each night you and the rest of the Family choose who dies. You win when the Family equals the town in numbers.' },
    CONVERT: {
      name: 'The Godfather',
      prompt: 'Decides whether to make the victim one of his own instead of killing them. Once only.',
      brief: 'Once in the whole game you can make your victim one of your own instead of killing them.',
    },
    ROGUE: { name: 'The Renegade', prompt: 'Picks another victim — his own side included.' , brief: 'On even nights you pick a victim of your own, separate from the one the Family agrees on. It can be anyone in town, including one of your own.' },
    PICK_SIDE: { name: 'The Associate', prompt: 'Decides which side he is on.' , brief: 'On the first night you secretly decide whether to join the Family or stay with the town. Whichever you pick, nobody else will know.' },

    // ---- The town ----
    PLAIN: { name: 'The Citizen', prompt: 'Sleeps.' , brief: 'You have no ability and are never woken at night. Your only weapon is the conversation: listen, question, and work out who is lying.' },
    INSPECT: { name: 'The Detective', prompt: 'Points at someone — show them that card.' , brief: 'Each night you pick someone and the narrator secretly shows you their card. Nobody else sees it, so you must convince them without proof.' },
    GUARD: {
      name: 'The Bodyguard',
      prompt: 'Chooses who to protect. May pick himself, but never the same person two nights running.',
      brief: 'Each night you protect someone from dying. You may protect yourself, but never the same person two nights running.',
    },
    MEDIC: {
      name: 'The Santera',
      prompt: 'Tell her who is about to die. She decides whether to spend the cure or the poison.',
      brief: 'You have two potions, each good for one use only: one saves whoever is about to die that night, the other kills anyone you choose.',
    },
    SURVIVE: { name: 'The Veteran', prompt: 'Survives the first attempt on his life.' , brief: 'You survive the first attempt on your life; the second one kills you. The town is never told the attempt failed, so only you will know.' },
    SILENCE: { name: 'The Arsonist', prompt: 'Burns a house down — tomorrow they cannot speak or vote.' , brief: 'On odd nights you burn someone\'s house down — the next day they cannot speak or vote.' },
    EXTRA_VOTE: { name: 'The Snitch', prompt: 'Points at someone — tomorrow they carry an extra vote against them.' , brief: 'Each night you mark someone, and the next day they carry an extra vote against them.' },
    PAIR: { name: 'The Binding', prompt: 'Ties two people together. If one falls, the other follows.' , brief: 'On the first night you tie two people together. If one of them dies, the other goes with them.' },
    PROTEGE: { name: 'The Orphan', prompt: 'Chooses a mentor. If the mentor is killed, he joins the Family.' , brief: 'On the first night you secretly choose a mentor. While they live you play with the town; if they are killed, you join the Family.' },
    SENSE: { name: 'The Bloodhound', prompt: 'Growls when a killer is sitting beside him.' , brief: 'Each morning the town is told whether a killer is sitting right beside you. It is never said which of your two neighbours it is.' },
    AVENGE: { name: 'The Gunman', prompt: 'Takes someone with him when he dies.' , brief: 'When you die, you take someone down with you, and the choice is yours. It makes no difference how you fall — at night, or executed.' },
    MARTYR: { name: 'The Martyr', prompt: 'Wins if the town executes him.' , brief: 'You win on your own if you get the town to vote you out. Being killed at night does not count, so make yourself look guilty.' },
    SWAP: { name: 'The Chameleon', prompt: 'Takes a spare card from the centre and changes role.' , brief: 'For the first three nights you may take a spare card from the centre and change role.' },
    PEEK: { name: 'The Witness', prompt: 'Opens their eyes while the Family is awake.' , brief: 'You may crack your eyes open while the Family is awake, to see who they are. If you are caught looking, you are dead.' },
    SPLIT: { name: 'The Cultist', prompt: 'Splits the town into two factions.' , brief: 'On the first night you split the town into two opposing factions. Only you know who ended up on which side, and that secret is your edge.' },
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
    },
    timeline: {
      title: 'Everything that happened',
      open: 'Open the log',
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
