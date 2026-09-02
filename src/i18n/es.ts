import type { Strings } from './strings'

export const es: Strings = {
  appName: 'Omertà',
  locale: 'es',
  languageName: 'Español',

  roles: {
    // ---- La familia ----
    KILLER: { name: 'La Familia', prompt: 'Eligen a su víctima.' , brief: 'Cada noche, con los tuyos, eliges a quién matar. Ganáis cuando la Familia iguale en número al pueblo.' , detail: 'Cada noche el narrador despierta a toda la Familia a la vez y elegís juntos, en silencio, a quién matar; señalad con el dedo y poneos de acuerdo sin hablar. De día sois ciudadanos como los demás: acusad, defended y desviad la sospecha. Ganáis cuando quedéis tantos como el resto del pueblo.' },
    CONVERT: {
      name: 'El Padrino',
      prompt: 'Decide si hace suyo al elegido en vez de matarlo. Una sola vez.',
      brief: 'Una vez en toda la partida puedes hacer tuya a la víctima en lugar de matarla: se unirá a la Familia.',
      detail: 'Eres de la Familia y despiertas con ellos cada noche. Una sola vez en la partida, cuando la Familia elija víctima, puedes levantar la mano: en vez de morir, esa persona se convierte en uno de los vuestros y el narrador se lo dirá en privado. Elige bien el momento; sólo hay una oportunidad.',
    },
    ROGUE: { name: 'El Renegado', prompt: 'Elige otra víctima, incluso de los suyos.' , brief: 'Las noches pares eliges una víctima aparte de la de la Familia. Puede ser cualquiera del pueblo, e incluso uno de los tuyos.' , detail: 'Eres de la Familia, pero las noches pares actúas también por tu cuenta: eliges una segunda víctima que puede ser cualquiera, incluso otro miembro de la Familia. Úsalo para quitar sospechas de encima o para limpiar la casa. Las noches impares sólo actúas con los demás.' },
    PICK_SIDE: { name: 'El Aspirante', prompt: 'Decide de qué lado está.' , brief: 'La primera noche decides en secreto si te unes a la Familia o te quedas con el pueblo. Elijas lo que elijas, nadie más lo sabrá.' , detail: 'La primera noche el narrador te despierta a solas y decides en secreto: ¿te unes a la Familia o te quedas con el pueblo? Si eliges la Familia, despertarás con ellos a partir de entonces. Nadie más sabrá nunca qué elegiste, ni siquiera al final.' },

    // ---- El pueblo ----
    PLAIN: { name: 'El Ciudadano', prompt: 'Duerme.' , brief: 'No tienes ningún poder y nadie te despertará por la noche. Tu única arma es la conversación: escucha, pregunta y averigua quién miente.' , detail: 'No tienes ningún poder especial y el narrador nunca te despertará de noche. Tu partida se juega entera de día: escucha quién acusa a quién, fíjate en quién cambia de versión y vota con cabeza. Los ciudadanos ganan cuando no quede nadie de la Familia.' },
    INSPECT: { name: 'El Detective', prompt: 'Señala a alguien: enséñale su carta.' , brief: 'Cada noche eliges a alguien y el narrador te enseña su carta en secreto. Nadie más la ve, así que tendrás que convencerles sin pruebas.' , detail: 'Cada noche el narrador te despierta y señalas a una persona; te enseña su carta en secreto y vuelves a dormir. Nadie más la ve, así que de día tendrás que convencer a los demás sin poder demostrarlo. Cuidado con revelarte demasiado pronto: la Familia irá a por ti.' },
    GUARD: {
      name: 'El Guardaespaldas',
      prompt: 'Elige a quién proteger. Puede ser él mismo, pero nunca el mismo dos noches seguidas.',
      brief: 'Cada noche proteges de la muerte a quien elijas. Puedes protegerte a ti mismo, pero nunca a la misma persona dos noches seguidas.',
      detail: 'Cada noche eliges a una persona y esa noche no puede morir, pase lo que pase. Puedes elegirte a ti mismo, pero nunca a la misma persona dos noches seguidas. Si salvas a alguien, ni esa persona ni el pueblo se enterarán: sólo tú.',
    },
    MEDIC: {
      name: 'La Santera',
      prompt: 'Dile quién va a morir. Decide si usa el remedio o el veneno.',
      brief: 'Tienes dos pócimas y cada una sirve una sola vez: una salva a quien vaya a morir esa noche, la otra mata a quien tú elijas.',
      detail: 'Tienes dos pócimas y cada una sirve una sola vez. Cada noche el narrador te dice quién va a morir y decides: usar el remedio para salvar a esa persona, usar el veneno para matar a otra, o guardar las dos. Una vez gastada una pócima, no vuelve.',
    },
    SURVIVE: { name: 'El Veterano', prompt: 'Sobrevive al primer atentado contra su vida.' , brief: 'Sobrevives al primer atentado contra tu vida; el segundo sí te mata. Al pueblo no se le dice que fallaron, así que sólo tú lo sabrás.' , detail: 'El primer intento de matarte falla: amaneces vivo y al pueblo no se le dice nada. Sólo tú sabrás que fueron a por ti, y eso es información valiosa. El segundo intento sí te mata, así que no te confíes.' },
    SILENCE: { name: 'El Incendiario', prompt: 'Quema una casa: mañana no podrá hablar ni votar.' , brief: 'Las noches impares eliges una casa y le prendes fuego: al día siguiente esa persona no puede hablar ni votar.' , detail: 'Las noches impares el narrador te despierta y eliges una casa para prenderle fuego. Al día siguiente esa persona no puede hablar ni votar, y todo el pueblo lo sabe. Úsalo para callar a quien más daño haga al pueblo… o a quien más te convenga.' },
    EXTRA_VOTE: { name: 'El Soplón', prompt: 'Señala a alguien: mañana tendrá un voto más en contra.' , brief: 'Cada noche eliges a alguien y al día siguiente cargará con un voto más en su contra.' , detail: 'Cada noche el narrador te despierta y eliges a una persona. Al día siguiente cargará con un voto más en su contra en la votación, y sólo se dirá si termina siendo decisivo. Es una forma silenciosa de empujar al pueblo hacia quien sospechas.' },
    PAIR: { name: 'El Amarre', prompt: 'Ata a dos personas. Si una cae, la otra la sigue.' , brief: 'La primera noche atas a dos personas. Si una de ellas muere, la otra se va con ella.' , detail: 'La primera noche eliges a dos personas y quedan atadas para siempre: si una muere, la otra muere con ella. El narrador se lo dirá a las dos en privado, y sabrán quién es la otra. Si acabas atando a alguien del pueblo con alguien de la Familia, esas dos personas ganan juntas si quedan las últimas.' },
    PROTEGE: { name: 'El Huérfano', prompt: 'Elige a su padrino. Si lo matan, se une a la Familia.' , brief: 'La primera noche eliges a un padrino en secreto. Mientras viva juegas con el pueblo; si lo matan, te unes a la Familia.' , detail: 'La primera noche eliges a un padrino en secreto y el narrador lo apunta. Mientras esa persona viva, juegas con el pueblo como uno más. Si la matan, esa misma noche te unes a la Familia y despertarás con ellos a partir de entonces; nadie más lo sabrá.' },
    SENSE: { name: 'El Sabueso', prompt: 'Gruñe si tiene un asesino al lado.' , brief: 'Cada mañana se avisa al pueblo si tienes a un asesino sentado justo a tu lado. Nunca se dice cuál de los dos vecinos es.' , detail: 'No haces nada de noche, pero cada mañana el narrator avisa al pueblo si tienes a un miembro de la Familia sentado justo a tu lado. Nunca dice cuál de tus dos vecinos es. Los asientos de la mesa importan: cambia de sitio y cambiará lo que averiguas.' },
    AVENGE: { name: 'El Pistolero', prompt: 'Al morir se lleva a alguien por delante.' , brief: 'Cuando mueras, te llevas a alguien por delante: tú eliges a quién. Da igual cómo caigas, de noche o ejecutado por el pueblo.' , detail: 'Cuando mueras, da igual cómo, antes de irte eliges a alguien y esa persona muere contigo. El narrador te lo preguntará en el momento. Piénsalo con calma: es tu última jugada y no se puede deshacer.' },
    MARTYR: { name: 'El Mártir', prompt: 'Gana si el pueblo lo ejecuta.' , brief: 'Ganas tú solo si consigues que el pueblo te ejecute en la votación. Si te matan de noche no cuenta, así que hazte sospechoso.' , detail: 'Ganas solo, por tu cuenta, si consigues que el pueblo te ejecute en una votación. Si te matan de noche no cuenta y pierdes. Tu trabajo es parecer culpable sin pasarte: si nadie te cree, nadie te vota.' },
    SWAP: { name: 'El Camaleón', prompt: 'Toma una carta del centro y cambia de papel.' , brief: 'Las tres primeras noches puedes coger una carta sobrante del centro y cambiar de papel. Los demás verán que esa carta ha desaparecido.' , detail: 'Las tres primeras noches el narrador te enseña las cartas que sobraron al repartir. Puedes coger una y pasas a ser ese papel a partir de entonces; los demás sabrán qué carta ha desaparecido del centro, pero no quién la tiene. A partir de la cuarta noche ya no puedes cambiar.' },
    PEEK: { name: 'El Testigo', prompt: 'Abre los ojos mientras la Familia actúa.' , brief: 'Puedes abrir los ojos un instante mientras la Familia actúa, para ver quiénes son. Si te pillan mirando, estás muerto.' , detail: 'Mientras la Familia despierta y elige, tú puedes abrir un poco los ojos para ver quiénes son. Es la información más valiosa de la partida, pero si algún miembro de la Familia te pilla mirando, mueres en su lugar esa misma noche. Mira poco y mira bien.' },
    SPLIT: { name: 'El Sectario', prompt: 'Divide al pueblo en dos bandos.' , brief: 'La primera noche divides al pueblo en dos bandos enfrentados. Sólo tú sabes quién quedó en cada lado, y ese secreto es tu ventaja.' , detail: 'La primera noche divides al pueblo en dos bandos, y el narrador se lo comunica a cada persona en privado. Sólo tú sabes la lista completa. Cómo uses ese secreto depende de ti y de la mesa: es una carta de manipulación pura.' },
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
      whoIsPlaying: '¿Quién juega?',
      addName: 'Añadir',
      addHint: 'Escribe un nombre y pulsa Intro. Uno detrás de otro.',
      minPlayers: (n) => `Hacen falta al menos ${n} jugadores`,
      namesReady: (n) => `${n} jugadores. ¡Vamos!`,
      clearNames: 'Borrar la lista',
      clearConfirm: '¿Seguro? Se borran todos los nombres.',
      remove: 'Quitar',
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
      rearrange: 'Recolocar asientos',
      rearrangeHint: 'Toca a dos personas para intercambiarlas',
      rearrangeDone: 'Asientos listos',
      moveLeft: '◀ Mover',
      moveRight: 'Mover ▶',
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
      sideTown: 'Está con el pueblo',
      sideCrew: 'Está con la Familia',
      released: 'Oculto. Devuelve el móvil.',
      allSeen: 'Todos han visto su papel',
      beginFirstNight: 'Empezar la primera noche',
      showAgain: 'Volver a ver un papel',
      doneViewing: 'Listo, pasar el móvil',
      pickPlayer: '¿Quién quiere verlo?',
      hasQuestion: 'Tengo una duda',
      hasQuestions: 'Quieren preguntar algo',
      questionMarked: 'Avisado. El narrador hablará contigo en privado.',
      questionsRound: 'Dudas antes de empezar',
      questionsIntro: 'Estas personas tienen una duda sobre su papel. Enséñales su carta en privado, una a una.',
      showRoleTo: (name) => `Enséñale su papel a ${name}`,
      clearFlag: 'Ya está claro',
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
      asCircle: 'Ver en círculo',
      asList: 'Ver en lista',
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
      finishNow: 'Terminar la partida',
      history: 'Toda la partida',
    },
    menu: {
      more: 'Más',
      language: 'Idioma',
      layout: 'Elegir a la gente en',
      circle: 'El círculo',
      list: 'Una lista',
      restartConfirm: '¿Empezar de nuevo? Se olvida esta partida; los nombres se guardan.',
      endGameConfirm: '¿Terminar la partida ya? Verás el resumen y no podrás seguir jugando.',
    },
    timeline: {
      title: 'Todo lo que ha pasado',
      open: 'Cronología',
      revertHere: 'Volver aquí',
      nightStart: (n) => `Noche ${n}`,
      nightEnd: (n) => `Amanece tras la noche ${n}`,
      lynch: (name) => `El pueblo ejecuta a ${name}`,
      hunterShot: (name) => `El Pistolero dispara a ${name}`,
      skipped: (role) => `${role}: no actúa`,
      chose: (role, name) => `${role} elige a ${name}`,
      pairedUp: (role, a, b) => `${role} ata a ${a} y ${b}`,
      potion: (role, name, kind) => `${role} usa ${kind} con ${name}`,
      acted: (role) => `${role} actúa`,
    },
  },
}
