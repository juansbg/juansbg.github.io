import type { Strings } from './strings'

export const es: Strings = {
  appName: 'Omertà',
  locale: 'es',
  languageName: 'Español',

  roles: {
    // ---- La familia ----
    KILLER: { name: 'La Familia', prompt: 'Eligen a su víctima.' , brief: 'Cada noche, con los tuyos, eliges a quién matar. Ganáis cuando la Familia iguale en número al pueblo.' },
    CONVERT: {
      name: 'El Padrino',
      prompt: 'Decide si hace suyo al elegido en vez de matarlo. Una sola vez.',
      brief: 'Una vez en toda la partida puedes hacer tuya a la víctima en lugar de matarla: se unirá a la Familia.',
    },
    ROGUE: { name: 'El Renegado', prompt: 'Elige otra víctima, incluso de los suyos.' , brief: 'Las noches pares eliges otra víctima. Puede ser cualquiera, incluso de los tuyos.' },
    PICK_SIDE: { name: 'El Aspirante', prompt: 'Decide de qué lado está.' , brief: 'La primera noche decides si te unes a la Familia o te quedas con el pueblo.' },

    // ---- El pueblo ----
    PLAIN: { name: 'El Ciudadano', prompt: 'Duerme.' , brief: 'No tienes ningún poder. Tu única arma es la conversación: averigua quién miente.' },
    INSPECT: { name: 'El Detective', prompt: 'Señala a alguien: enséñale su carta.' , brief: 'Cada noche eliges a alguien y el narrador te enseña su carta en secreto.' },
    GUARD: {
      name: 'El Guardaespaldas',
      prompt: 'Elige a quién proteger. Puede ser él mismo, pero nunca el mismo dos noches seguidas.',
      brief: 'Cada noche proteges de la muerte a quien elijas. Puedes protegerte a ti mismo, pero nunca a la misma persona dos noches seguidas.',
    },
    MEDIC: {
      name: 'La Santera',
      prompt: 'Dile quién va a morir. Decide si usa el remedio o el veneno.',
      brief: 'Tienes dos pócimas y cada una sirve una sola vez: una salva a quien vaya a morir esa noche, la otra mata a quien tú elijas.',
    },
    SURVIVE: { name: 'El Veterano', prompt: 'Sobrevive al primer atentado contra su vida.' , brief: 'Sobrevives al primer atentado contra tu vida. El segundo sí te mata.' },
    SILENCE: { name: 'El Incendiario', prompt: 'Quema una casa: mañana no podrá hablar ni votar.' , brief: 'Las noches impares eliges una casa y le prendes fuego: al día siguiente esa persona no puede hablar ni votar.' },
    EXTRA_VOTE: { name: 'El Soplón', prompt: 'Señala a alguien: mañana tendrá un voto más en contra.' , brief: 'Cada noche eliges a alguien y al día siguiente cargará con un voto más en su contra.' },
    PAIR: { name: 'El Amarre', prompt: 'Ata a dos personas. Si una cae, la otra la sigue.' , brief: 'La primera noche atas a dos personas. Si una de ellas muere, la otra se va con ella.' },
    PROTEGE: { name: 'El Huérfano', prompt: 'Elige a su padrino. Si lo matan, se une a la Familia.' , brief: 'La primera noche eliges a un padrino. Si lo matan, te unes a la Familia.' },
    SENSE: { name: 'El Sabueso', prompt: 'Gruñe si tiene un asesino al lado.' , brief: 'Cada mañana se avisa al pueblo si tienes a un asesino sentado justo a tu lado.' },
    AVENGE: { name: 'El Pistolero', prompt: 'Al morir se lleva a alguien por delante.' , brief: 'Cuando mueras, te llevas a alguien por delante: tú eliges a quién.' },
    MARTYR: { name: 'El Mártir', prompt: 'Gana si el pueblo lo ejecuta.' , brief: 'Ganas si consigues que el pueblo te ejecute. Si te matan de noche, no cuenta.' },
    SWAP: { name: 'El Camaleón', prompt: 'Toma una carta del centro y cambia de papel.' , brief: 'Las tres primeras noches puedes coger una carta del centro y cambiar de papel.' },
    PEEK: { name: 'El Testigo', prompt: 'Abre los ojos mientras la Familia actúa.' , brief: 'Puedes abrir los ojos mientras la Familia actúa. Si te pillan, estás muerto.' },
    SPLIT: { name: 'El Sectario', prompt: 'Divide al pueblo en dos bandos.' , brief: 'La primera noche divides al pueblo en dos bandos enfrentados.' },
  },

  phase: {
    nightFalls: 'La ciudad duerme',
    nightFallsBody: 'Que todos cierren los ojos.',
    townWakes: '¡La ciudad despierta!',
    townWakesBody: 'El pueblo discute lo ocurrido esta noche.',
    quietNight: 'La noche ha pasado sin novedad.',
  },

  outcome: {
    death: (name, cause) => {
      switch (cause) {
        case 'killers':
          return `Ha amanecido muerto ${name}.`
        case 'rogue':
          return `También ha muerto ${name}.`
        case 'poison':
          return `${name} ha muerto envenenado.`
        case 'lynch':
          return `El pueblo ha ejecutado a ${name}.`
        case 'heartbreak':
          return `${name} no ha soportado la pérdida y se ha ido con su amarre.`
        case 'revenge':
          return `${name} ha caído por el último disparo del Pistolero.`
      }
    },
    silenced: (name) => `Han quemado la casa de ${name}: hoy no puede hablar ni votar.`,
    extraVote: (name) => `${name} carga hoy con un voto más en su contra.`,
    growl: () => 'El sabueso ha gruñido esta noche.',
  },

  winner: {
    town: 'Gana el pueblo.',
    crew: 'Gana la Familia.',
    lovers: 'Ganan los amarrados.',
    martyr: 'Gana el Mártir: el pueblo cayó en su trampa.',
  },

  ui: {
    common: {
      next: 'Siguiente',
      back: 'Atrás',
      done: 'Listo',
      cancel: 'Cancelar',
      undo: 'Deshacer',
      restart: 'Reiniciar',
      confirm: 'Confirmar',
      close: 'Cerrar',
    },
    setup: {
      howMany: '¿Cuántos jugadores?',
      players: 'Jugadores',
      namePlaceholder: 'Nombre',
      rolePlaceholder: 'Elige un papel',
      tapToEdit: 'Toca a un jugador para editarlo',
      save: 'Guardar',
      start: 'Repartir papeles',
      incomplete: 'Faltan jugadores por definir',
      duplicateRoleHint: 'Puedes repetir papeles y nombres sin problema',
      dealRandom: 'Repartir al azar',
      complexity: 'Dificultad',
      simple: 'Sencilla',
      standard: 'Normal',
      complex: 'Avanzada',
      editRoles: 'Ver y ajustar papeles',
    },
    reveal: {
      passTo: (name) => `Pásale el móvil a ${name}`,
      areYou: (name) => `¿Eres ${name}?`,
      shieldScreen: 'Que nadie más mire la pantalla.',
      holdToReveal: 'Mantén pulsado para ver tu papel',
      keepHolding: 'No sueltes',
      yourRole: 'Tu papel',
      teamTown: 'Estás con el pueblo',
      teamCrew: 'Estás con la Familia',
      released: 'Oculto. Devuelve el móvil.',
      allSeen: 'Todos han visto su papel',
      beginFirstNight: 'Empezar la primera noche',
      showAgain: 'Volver a ver un papel',
      doneViewing: 'Listo, pasar el móvil',
      pickPlayer: '¿Quién quiere verlo?',
    },
    night: {
      stepCounter: (current, total) => `${current} de ${total}`,
      noOne: 'Nadie',
      heal: 'Curar',
      poison: 'Envenenar',
      pickOne: 'Elige a quién',
      pickTwo: 'Elige a dos',
      endNight: 'Terminar la noche',
      wakeGroup: 'Que despierten juntos.',
    },
    day: {
      report: 'Lo que ha pasado esta noche',
      whoDies: '¿A quién ejecuta el pueblo?',
      nobody: 'Nadie muere hoy',
      nextNight: 'Cae la noche',
      silencedToday: (name) => `${name} no puede hablar ni votar hoy`,
    },
    over: {
      title: 'Fin de la partida',
      playAgain: 'Jugar otra vez',
    },
  },
}
