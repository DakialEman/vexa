'use strict';

// Vexa — textos de la interfaz, en cada idioma.
//
// Todo lo que el usuario lee sale de aca. La clave describe donde va, no lo
// que dice: si mañana cambia el texto, la clave sigue sirviendo.
//
// El castellano es el idioma de referencia: si a otro idioma le falta una
// clave, se muestra la castellana en vez de un hueco.

const POR_DEFECTO = 'es';

/**
 * Idiomas disponibles.
 *
 * `pideAsi` es lo que el navegador interno le dice a los sitios que idioma
 * prefiere (la cabecera Accept-Language). Por eso al cambiar el idioma de
 * Vexa, las paginas tambien pasan a verse en ese idioma.
 *
 * Va como lista de codigos y NADA MAS: nada de "es;q=0.9". Los pesos los
 * agrega Chromium solo, y si vienen puestos quedan repetidos y la cabecera
 * sale malformada ("es;q=0.9;q=0.9").
 */
const IDIOMAS = Object.freeze({
  es: { nombre: 'Español', pideAsi: 'es-AR,es,en' },
  en: { nombre: 'English', pideAsi: 'en-US,en' },
  pt: { nombre: 'Português', pideAsi: 'pt-BR,pt,en' },
});

const TEXTOS = {
  es: {
    // Barra de navegacion
    'barra.atras': 'Atrás (Alt+←)',
    'barra.adelante': 'Adelante (Alt+→)',
    'barra.recargar': 'Recargar (F5)',
    'barra.detener': 'Detener (Esc)',
    'barra.inicio': 'Inicio de Vexa',
    'barra.direccion': 'Buscá algo o escribí una dirección',
    'barra.mirando': 'Estás mirando lo que abre tu amigo',
    'barra.bloqueados': 'bloqueados',
    'barra.verJuntos': 'Ver juntos',
    'barra.verJuntosAyuda': 'Ver juntos con un amigo',
    'barra.darControl': 'Dar control',
    'barra.quitarControl': 'Quitar control',
    'barra.tenesControl': 'Tenés el control',
    'barra.mirandoControl': 'Mirando',
    'barra.darControlAyuda': 'Pasarle el control de tu navegador a tu amigo.',
    'barra.quitarControlAyuda': 'Tu amigo está manejando tu navegador. Clic para recuperarlo.',
    'barra.tenesControlAyuda': 'Podés manejar el navegador de tu amigo.',
    'barra.mirandoControlAyuda': 'Tu amigo tiene el control.',
    'barra.bloqueadosAyuda': 'Clic para abrir la última ventana bloqueada (a veces el reproductor se abre así).',

    // Pantalla de inicio
    'inicio.lema': 'Ver películas y series en simultáneo con un amigo.',
    'inicio.ayuda1': 'Escribí arriba una dirección o lo que quieras buscar.',
    'inicio.ayuda2': 'Los pop-ups se bloquean solos. Si el reproductor abría uno de verdad, tocá el botón de la derecha.',
    'inicio.ayuda3': 'Atajos:',
    'inicio.atajoBarra': 'barra',
    'inicio.atajoAtras': 'atrás',
    'inicio.atajoRecargar': 'recargar',
    'inicio.atajoDetener': 'detener',

    // Error de carga
    'error.titulo': 'No se pudo abrir la página',
    'error.detalle': 'Revisá la dirección o tu conexión a internet.',
    'error.reintentar': 'Reintentar',
    'error.volver': 'Volver al inicio',

    // Panel de sesion
    'sesion.titulo': 'Ver juntos',
    'sesion.bajada': 'Uno abre una sala y pasa el código. El otro lo escribe y entra.',
    'sesion.abrir': 'Abrir una sala',
    'sesion.entrar': 'Entrar con un código',
    'sesion.elegirCodigo': 'Quiero elegir el código',
    'sesion.codigoPropioEjemplo': 'por ejemplo: pepe-y-yo',
    'sesion.codigoPropioNota': 'Letras, números y guiones. Si alguien más lo está usando, te avisa.',
    'sesion.pasaleCodigo': 'Pasale este código a tu amigo',
    'sesion.copiar': 'Copiar código',
    'sesion.esperando': 'Esperando a que entre… podés seguir navegando mientras tanto.',
    'sesion.puedeTardar': 'Esto puede tardar hasta un minuto la primera vez del día.',
    'sesion.escribiCodigo': 'Escribí el código que te pasaron',
    'sesion.conectar': 'Entrar',
    'sesion.cortar': 'Cortar y volver',
    'sesion.ajustes': 'Ajustes',

    // Ajustes
    'ajustes.servidor': 'Servidor de Vexa',
    'ajustes.servidorNota': 'Pegá acá la dirección que te dio Render al publicar el servidor. Tiene que ser la misma en las dos computadoras.',
    'ajustes.guardar': 'Guardar',
    'ajustes.probar': 'Probar',
    'ajustes.idioma': 'Idioma',
    'ajustes.idiomaNota': 'Cambia el idioma de Vexa y también el de las páginas que abras.',

    // Estados y avisos
    'estado.sinConexion': 'Sin conexión.',
    'estado.conectando': 'Conectando con tu amigo…',
    'estado.conectados': 'Conectados.',
    'estado.corto': 'Se cortó la conexión. Reintentando…',
    'estado.fallo': 'No se pudo conectar. Prueben de nuevo.',
    'estado.cerrada': 'Sin conexión.',
    'estado.desconocido': 'Estado desconocido.',
    'estado.hablandoServidor': 'Hablando con el servidor… si estaba dormido puede tardar un minuto.',
    'estado.salaAbierta': 'Sala abierta. Pasale el código a tu amigo.',
    'estado.buscandoSala': 'Buscando la sala… si el servidor dormía puede tardar un minuto.',
    'estado.entraste': 'Entraste. Esperando el video…',
    'estado.probandoServidor': 'Probando el servidor… puede tardar un minuto si estaba dormido.',
    'estado.servidorAnda': 'El servidor anda. Contestó en {segundos} segundos.',

    'aviso.codigoCopiado': 'Código copiado. Pasáselo a tu amigo.',
    'aviso.nadaQueCopiar': 'Todavía no hay código para copiar.',
    'aviso.faltaServidor': 'Primero configurá el servidor de Vexa, en Ajustes.',
    'aviso.escribiServidor': 'Escribí primero la dirección del servidor.',
    'aviso.servidorGuardado': 'Servidor guardado.',
    'aviso.servidorBorrado': 'Servidor borrado.',
    'aviso.idiomaGuardado': 'Idioma cambiado.',
    'aviso.pedileControl': 'Pedile el control a tu amigo para poder navegar.',
    'aviso.sinConexionParaMandar': 'No se pudo mandar el pedido: la conexión no está lista.',
    'aviso.teDieronControl': 'Te pasaron el control.',
    'aviso.recuperoControl': 'Tu amigo recuperó el control.',
    'aviso.pasasteControl': 'Le pasaste el control a tu amigo.',
    'aviso.recuperasteControl': 'Recuperaste el control.',
    'aviso.noSePudoAvisar': 'No se pudo avisarle a tu amigo: la conexión no está lista.',
    'aviso.puenteRoto': 'Vexa no pudo iniciar: el puente con la aplicación no cargó.',
  },

  en: {
    'barra.atras': 'Back (Alt+←)',
    'barra.adelante': 'Forward (Alt+→)',
    'barra.recargar': 'Reload (F5)',
    'barra.detener': 'Stop (Esc)',
    'barra.inicio': 'Vexa home',
    'barra.direccion': 'Search or type an address',
    'barra.mirando': "You're watching what your friend opens",
    'barra.bloqueados': 'blocked',
    'barra.verJuntos': 'Watch together',
    'barra.verJuntosAyuda': 'Watch together with a friend',
    'barra.darControl': 'Give control',
    'barra.quitarControl': 'Take control back',
    'barra.tenesControl': 'You have control',
    'barra.mirandoControl': 'Watching',
    'barra.darControlAyuda': 'Hand your browser over to your friend.',
    'barra.quitarControlAyuda': 'Your friend is driving your browser. Click to take it back.',
    'barra.tenesControlAyuda': "You can drive your friend's browser.",
    'barra.mirandoControlAyuda': 'Your friend has control.',
    'barra.bloqueadosAyuda': 'Click to open the last blocked window (sometimes the player opens that way).',

    'inicio.lema': 'Watch movies and shows with a friend, at the same time.',
    'inicio.ayuda1': 'Type an address above, or anything you want to search.',
    'inicio.ayuda2': 'Pop-ups are blocked automatically. If the player really did open one, use the button on the right.',
    'inicio.ayuda3': 'Shortcuts:',
    'inicio.atajoBarra': 'address bar',
    'inicio.atajoAtras': 'back',
    'inicio.atajoRecargar': 'reload',
    'inicio.atajoDetener': 'stop',

    'error.titulo': "Couldn't open the page",
    'error.detalle': 'Check the address or your internet connection.',
    'error.reintentar': 'Try again',
    'error.volver': 'Back to home',

    'sesion.titulo': 'Watch together',
    'sesion.bajada': 'One opens a room and shares the code. The other types it in and joins.',
    'sesion.abrir': 'Open a room',
    'sesion.entrar': 'Join with a code',
    'sesion.elegirCodigo': 'I want to pick the code',
    'sesion.codigoPropioEjemplo': 'for example: joe-and-me',
    'sesion.codigoPropioNota': "Letters, numbers and dashes. If someone else is using it, you'll be told.",
    'sesion.pasaleCodigo': 'Send this code to your friend',
    'sesion.copiar': 'Copy code',
    'sesion.esperando': 'Waiting for them to join… you can keep browsing meanwhile.',
    'sesion.puedeTardar': 'This can take up to a minute the first time each day.',
    'sesion.escribiCodigo': 'Type the code you were given',
    'sesion.conectar': 'Join',
    'sesion.cortar': 'Hang up and go back',
    'sesion.ajustes': 'Settings',

    'ajustes.servidor': 'Vexa server',
    'ajustes.servidorNota': 'Paste the address Render gave you when you published the server. It has to be the same on both computers.',
    'ajustes.guardar': 'Save',
    'ajustes.probar': 'Test',
    'ajustes.idioma': 'Language',
    'ajustes.idiomaNota': 'Changes the language of Vexa and of the pages you open.',

    'estado.sinConexion': 'Not connected.',
    'estado.conectando': 'Connecting to your friend…',
    'estado.conectados': 'Connected.',
    'estado.corto': 'The connection dropped. Retrying…',
    'estado.fallo': "Couldn't connect. Try again.",
    'estado.cerrada': 'Not connected.',
    'estado.desconocido': 'Unknown state.',
    'estado.hablandoServidor': 'Talking to the server… if it was asleep this can take a minute.',
    'estado.salaAbierta': 'Room open. Send the code to your friend.',
    'estado.buscandoSala': 'Looking for the room… if the server was asleep this can take a minute.',
    'estado.entraste': 'Joined. Waiting for video…',
    'estado.probandoServidor': 'Testing the server… can take a minute if it was asleep.',
    'estado.servidorAnda': 'The server is up. It answered in {segundos} seconds.',

    'aviso.codigoCopiado': 'Code copied. Send it to your friend.',
    'aviso.nadaQueCopiar': 'There is no code to copy yet.',
    'aviso.faltaServidor': 'Set up the Vexa server first, under Settings.',
    'aviso.escribiServidor': "Type the server's address first.",
    'aviso.servidorGuardado': 'Server saved.',
    'aviso.servidorBorrado': 'Server cleared.',
    'aviso.idiomaGuardado': 'Language changed.',
    'aviso.pedileControl': 'Ask your friend for control to browse.',
    'aviso.sinConexionParaMandar': "Couldn't send it: the connection isn't ready.",
    'aviso.teDieronControl': 'You were given control.',
    'aviso.recuperoControl': 'Your friend took control back.',
    'aviso.pasasteControl': 'You handed control to your friend.',
    'aviso.recuperasteControl': 'You took control back.',
    'aviso.noSePudoAvisar': "Couldn't tell your friend: the connection isn't ready.",
    'aviso.puenteRoto': "Vexa couldn't start: the bridge to the app didn't load.",
  },

  pt: {
    'barra.atras': 'Voltar (Alt+←)',
    'barra.adelante': 'Avançar (Alt+→)',
    'barra.recargar': 'Recarregar (F5)',
    'barra.detener': 'Parar (Esc)',
    'barra.inicio': 'Início do Vexa',
    'barra.direccion': 'Busque algo ou digite um endereço',
    'barra.mirando': 'Você está vendo o que seu amigo abre',
    'barra.bloqueados': 'bloqueados',
    'barra.verJuntos': 'Ver juntos',
    'barra.verJuntosAyuda': 'Ver junto com um amigo',
    'barra.darControl': 'Dar controle',
    'barra.quitarControl': 'Retomar controle',
    'barra.tenesControl': 'Você tem o controle',
    'barra.mirandoControl': 'Assistindo',
    'barra.darControlAyuda': 'Passar o controle do seu navegador para seu amigo.',
    'barra.quitarControlAyuda': 'Seu amigo está usando seu navegador. Clique para retomar.',
    'barra.tenesControlAyuda': 'Você pode usar o navegador do seu amigo.',
    'barra.mirandoControlAyuda': 'Seu amigo tem o controle.',
    'barra.bloqueadosAyuda': 'Clique para abrir a última janela bloqueada (às vezes o player abre assim).',

    'inicio.lema': 'Ver filmes e séries junto com um amigo, ao mesmo tempo.',
    'inicio.ayuda1': 'Digite um endereço acima, ou o que quiser buscar.',
    'inicio.ayuda2': 'Os pop-ups são bloqueados sozinhos. Se o player abriu um de verdade, use o botão da direita.',
    'inicio.ayuda3': 'Atalhos:',
    'inicio.atajoBarra': 'endereço',
    'inicio.atajoAtras': 'voltar',
    'inicio.atajoRecargar': 'recarregar',
    'inicio.atajoDetener': 'parar',

    'error.titulo': 'Não foi possível abrir a página',
    'error.detalle': 'Verifique o endereço ou sua conexão com a internet.',
    'error.reintentar': 'Tentar de novo',
    'error.volver': 'Voltar ao início',

    'sesion.titulo': 'Ver juntos',
    'sesion.bajada': 'Um abre uma sala e passa o código. O outro digita e entra.',
    'sesion.abrir': 'Abrir uma sala',
    'sesion.entrar': 'Entrar com um código',
    'sesion.elegirCodigo': 'Quero escolher o código',
    'sesion.codigoPropioEjemplo': 'por exemplo: eu-e-voce',
    'sesion.codigoPropioNota': 'Letras, números e hífens. Se alguém já estiver usando, avisamos.',
    'sesion.pasaleCodigo': 'Passe este código para seu amigo',
    'sesion.copiar': 'Copiar código',
    'sesion.esperando': 'Esperando ele entrar… pode continuar navegando enquanto isso.',
    'sesion.puedeTardar': 'Isso pode demorar até um minuto na primeira vez do dia.',
    'sesion.escribiCodigo': 'Digite o código que te passaram',
    'sesion.conectar': 'Entrar',
    'sesion.cortar': 'Desligar e voltar',
    'sesion.ajustes': 'Ajustes',

    'ajustes.servidor': 'Servidor do Vexa',
    'ajustes.servidorNota': 'Cole aqui o endereço que o Render te deu ao publicar o servidor. Tem que ser o mesmo nos dois computadores.',
    'ajustes.guardar': 'Salvar',
    'ajustes.probar': 'Testar',
    'ajustes.idioma': 'Idioma',
    'ajustes.idiomaNota': 'Muda o idioma do Vexa e também o das páginas que você abrir.',

    'estado.sinConexion': 'Sem conexão.',
    'estado.conectando': 'Conectando com seu amigo…',
    'estado.conectados': 'Conectados.',
    'estado.corto': 'A conexão caiu. Tentando de novo…',
    'estado.fallo': 'Não foi possível conectar. Tentem de novo.',
    'estado.cerrada': 'Sem conexão.',
    'estado.desconocido': 'Estado desconhecido.',
    'estado.hablandoServidor': 'Falando com o servidor… se estava dormindo pode demorar um minuto.',
    'estado.salaAbierta': 'Sala aberta. Passe o código para seu amigo.',
    'estado.buscandoSala': 'Procurando a sala… se o servidor dormia pode demorar um minuto.',
    'estado.entraste': 'Entrou. Esperando o vídeo…',
    'estado.probandoServidor': 'Testando o servidor… pode demorar um minuto se estava dormindo.',
    'estado.servidorAnda': 'O servidor está no ar. Respondeu em {segundos} segundos.',

    'aviso.codigoCopiado': 'Código copiado. Passe para seu amigo.',
    'aviso.nadaQueCopiar': 'Ainda não há código para copiar.',
    'aviso.faltaServidor': 'Configure primeiro o servidor do Vexa, em Ajustes.',
    'aviso.escribiServidor': 'Digite primeiro o endereço do servidor.',
    'aviso.servidorGuardado': 'Servidor salvo.',
    'aviso.servidorBorrado': 'Servidor apagado.',
    'aviso.idiomaGuardado': 'Idioma alterado.',
    'aviso.pedileControl': 'Peça o controle ao seu amigo para poder navegar.',
    'aviso.sinConexionParaMandar': 'Não foi possível enviar: a conexão não está pronta.',
    'aviso.teDieronControl': 'Te passaram o controle.',
    'aviso.recuperoControl': 'Seu amigo retomou o controle.',
    'aviso.pasasteControl': 'Você passou o controle para seu amigo.',
    'aviso.recuperasteControl': 'Você retomou o controle.',
    'aviso.noSePudoAvisar': 'Não foi possível avisar seu amigo: a conexão não está pronta.',
    'aviso.puenteRoto': 'O Vexa não conseguiu iniciar: a ponte com o aplicativo não carregou.',
  },
};

/**
 * Dice si un idioma existe.
 * @param {unknown} idioma
 */
function existe(idioma) {
  return typeof idioma === 'string' && Object.hasOwn(IDIOMAS, idioma);
}

/**
 * Devuelve un idioma usable: el pedido si existe, y si no el castellano.
 * @param {unknown} idioma
 */
function normalizar(idioma) {
  return existe(idioma) ? idioma : POR_DEFECTO;
}

/**
 * Busca un texto.
 *
 * @param {string} clave
 * @param {string} [idioma]
 * @param {Record<string, string|number>} [datos] Reemplazos tipo {segundos}.
 * @returns {string} La clave misma si no existe en ningun idioma, para que el
 *   hueco se note en pantalla en vez de quedar en blanco.
 */
function t(clave, idioma, datos) {
  const elegido = normalizar(idioma);
  const texto = TEXTOS[elegido]?.[clave] ?? TEXTOS[POR_DEFECTO][clave] ?? clave;

  if (!datos) return texto;

  return texto.replace(/\{(\w+)\}/g, (entero, nombre) =>
    (Object.hasOwn(datos, nombre) ? String(datos[nombre]) : entero));
}

/** Como le pide las paginas al servidor de cada sitio (cabecera Accept-Language). */
function comoPideLasPaginas(idioma) {
  return IDIOMAS[normalizar(idioma)].pideAsi;
}

/** Lista para armar el selector: [{codigo, nombre}]. */
function listar() {
  return Object.entries(IDIOMAS).map(([codigo, datos]) => ({ codigo, nombre: datos.nombre }));
}

module.exports = { IDIOMAS, POR_DEFECTO, TEXTOS, comoPideLasPaginas, existe, listar, normalizar, t };
