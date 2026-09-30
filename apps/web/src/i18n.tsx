import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "en" | "es" | "fr";

const STORAGE_KEY = "instafetch-locale";

const messages: Record<Locale, Record<string, string>> = {
  en: {
    language: "Language",
    primaryNavigation: "Primary navigation",
    mobileNavigation: "Mobile navigation",
    "menu.open": "Open menu",
    "menu.close": "Close menu",
    skipToContent: "Skip to content",
    "brand.home": "InstaFetch home",
    "nav.video": "Video",
    "nav.photo": "Photo",
    "nav.reels": "Reels",
    "nav.story": "Story",
    "nav.carousel": "Carousel",
    "nav.faq": "FAQ",
    "hero.kicker": "Verified Reels · YouTube Beta",
    "hero.title": "Instagram & YouTube",
    "hero.titleAccent": "Downloader",
    "hero.description":
      "Verified Instagram Reel downloads. YouTube is in beta, and other media may work when a genuine file is exposed anonymously.",
    "hero.noLogin": "No login",
    "hero.bestQuality": "Best available quality",
    "hero.otherMedia": "Other media when available",
    "input.label": "Instagram or YouTube URL",
    "input.placeholder": "Paste an Instagram or YouTube link here",
    "input.help":
      "Public links only. Availability depends on what each platform exposes without login.",
    "input.paste": "Paste",
    "input.clear": "Clear",
    "input.clearAria": "Clear Instagram or YouTube URL",
    "input.pasted": "Link pasted",
    "input.clipboardEmpty": "Clipboard is empty",
    "input.clipboardDenied": "Allow clipboard access to paste automatically",
    "input.resolving": "Resolving…",
    "input.download": "Download",
    "panel.footnote": "Public content only · No login required · Playlists are not supported",
    "feedback.prompt": "Found a problem? Send feedback",
    "feedback.helper":
      "Share the platform, link type, browser or device, safe error message, and whether preview or download worked. Never include passwords, cookies, private links, tokens, or personal information.",
    "feedback.emailBug": "Email a bug report",
    "feedback.emailFeature": "Email a feature request",
    "feedback.openBug": "Open GitHub bug form",
    "feedback.openFeature": "Open GitHub feature form",
    "feedback.collaboratorLabel": "For invited testers/collaborators",
    "feedback.privacyWarning":
      "Do not send passwords, cookies, authentication tokens, private media links, or other sensitive information.",
    "feedback.accessNote":
      "Use the email links above for public support. GitHub forms are for invited testers and collaborators.",
    "status.processing":
      "Checking the public post and preparing available media…",
    "status.waking":
      "Server is waking up. This can take up to a minute on the free hosting plan.",
    "status.keepTab": "Keep this tab open while we finish the request.",
    "status.errorHeading": "We couldn’t fetch that link",
    "status.tryAgain": "Try again",
    "preview.loading": "Loading preview…",
    "preview.unavailable": "Preview unavailable",
    "preview.hint": "Try the download button or resolve the link again.",
    "media.video": "Video",
    "media.photo": "Photo",
    "media.item": "Item",
    "media.of": "of",
    "media.originalQuality": "Original quality",
    "download.video": "Download video",
    "download.photo": "Download photo",
    "download.preparing": "Preparing…",
    "download.downloaded": "Downloaded",
    "download.retry": "Retry download",
    "results.eyebrow": "Ready to download",
    "results.of": "of",
    "results.itemsFound": "items found",
    "results.itemsAvailable": "items available",
    "results.mediaReady": "Your media is ready",
    "results.sharedBy": "Shared by",
    "results.publicMedia": "Public Instagram or YouTube media",
    "results.partial": "Some carousel items were unavailable.",
    "principles.label": "InstaFetch principles",
    "principles.public": "Public by design",
    "principles.publicDetail": "No private-account access",
    "principles.real": "Real media only",
    "principles.realDetail": "No placeholder links",
    "principles.anywhere": "Ready anywhere",
    "principles.anywhereDetail": "Availability can vary",
    "how.eyebrow": "How it works",
    "how.heading": "From link to saved media, without the clutter.",
    "how.intro":
      "Three small steps keep the experience clear and let you stay in control of what gets downloaded.",
    "how.step1.title": "Copy the link",
    "how.step1.text":
      "Copy the URL of a public Instagram post, Reel, photo, carousel, or YouTube video.",
    "how.step2.title": "Paste it here",
    "how.step2.text":
      "Drop the link into InstaFetch and let the public media provider check anonymous availability.",
    "how.step3.title": "Preview and download",
    "how.step3.text":
      "Check each available result, then save the genuine media you need.",
    "benefits.eyebrow": "A better save flow",
    "benefits.heading": "Useful by default.",
    "benefits.intro":
      "InstaFetch keeps the important details visible and the path to a download short.",
    "benefits.quick.title": "Quick processing",
    "benefits.quick.text":
      "A focused flow that gets from link to media with less waiting.",
    "benefits.screen.title": "Made for every screen",
    "benefits.screen.text":
      "A comfortable downloader on phones, tablets, and desktops.",
    "benefits.quality.title": "Source quality",
    "benefits.quality.text":
      "We show the best legitimate media format the provider exposes.",
    "benefits.privacy.title": "Privacy focused",
    "benefits.privacy.text":
      "No Instagram login, password, or browser cookies are requested.",
    "supported.eyebrow": "Supported content",
    "supported.heading": "Bring the link. We’ll show what’s really there.",
    "supported.intro":
      "Verified Reels are our clearest path. YouTube is in beta; other formats remain conditional on what each platform exposes anonymously.",
    "supported.video.status": "Supported when publicly accessible",
    "supported.video.title": "Instagram Video Downloader",
    "supported.video.text":
      "Public video media can be downloaded when Instagram exposes a genuine file without login.",
    "supported.photo.status": "Limited / depends on Instagram access",
    "supported.photo.title": "Instagram Photo Downloader",
    "supported.photo.text":
      "Photo availability varies by post and by the media Instagram exposes anonymously.",
    "supported.reels.status": "Verified",
    "supported.reels.title": "Instagram Reels Downloader",
    "supported.reels.text":
      "Public Reels are verified with real previews and downloadable media.",
    "supported.story.status": "Limited / compatibility varies",
    "supported.story.title": "Instagram Story Downloader",
    "supported.story.text":
      "A public Story works only when it is accessible without authentication.",
    "supported.carousel.status": "Limited / compatibility varies",
    "supported.carousel.title": "Instagram Carousel Downloader",
    "supported.carousel.text":
      "Items are shown individually when the public provider exposes each asset.",
    "supported.youtube.status": "Beta / public videos only",
    "supported.youtube.title": "YouTube Video Downloader",
    "supported.youtube.text":
      "Public YouTube videos up to 20 minutes can be downloaded when anonymous formats are available.",
    "supported.shorts.status": "Beta / public Shorts only",
    "supported.shorts.title": "YouTube Shorts Downloader",
    "supported.shorts.text":
      "Shorts use the same safe public-video path and remain subject to format availability.",
    "supported.learn": "Learn how it works",
    "faq.eyebrow": "Questions, answered",
    "faq.heading": "Good to know before you download.",
    "faq.intro":
      "Clear expectations help public-media tools stay useful and responsible.",
    "faq.q1": "What can InstaFetch download?",
    "faq.a1":
      "Public Reels are verified. Public video media, photos, carousels, Stories, and legacy TV links are conditional on anonymous availability.",
    "faq.q2": "Why can a public post still fail?",
    "faq.a2":
      "A post can be visible in a browser and still require login or fail to expose a downloadable asset to anonymous tools.",
    "faq.q3": "Why do Reels work when some photos do not?",
    "faq.a3":
      "Instagram exposes different media formats for different post types. Anonymous access can work for a Reel while an image post still requires login.",
    "faq.q4": "Does InstaFetch use my Instagram login?",
    "faq.a4":
      "No. InstaFetch does not request or use Instagram passwords, cookies, browser profiles, or authentication tokens.",
    "faq.q5": "Can private posts be downloaded?",
    "faq.a5":
      "No. InstaFetch does not bypass private accounts or access controls.",
    "faq.q6": "What quality will I get?",
    "faq.a6":
      "We select the best legitimate format returned by the public media provider. The available resolution is shown on each result card.",
    "faq.q7": "Does it work on mobile?",
    "faq.a7":
      "Yes. The interface is designed for touch screens and the resulting files can be saved or shared from supported mobile browsers.",
    "faq.q8": "Why can availability change over time?",
    "faq.a8":
      "Instagram availability, rate limits, and the formats exposed to anonymous requests can change. InstaFetch reports the current result without bypassing those limits.",
    "faq.q9": "How long do links last?",
    "faq.a9":
      "Preview and download links are short lived. Resolve the Instagram URL again if a link has expired.",
    "closing.kicker": "Ready when you are",
    "closing.heading": "Have a public link?",
    "closing.text": "Bring it back to the top and start a fresh preview.",
    "closing.cta": "Start downloading",
    "footer.tagline": "Public media, made simple.",
    "footer.credit": "Crafted with love ❤️ by Aman Sharma",
    "footer.explore": "Explore",
    "footer.info": "Info",
    "footer.privacy": "Privacy",
    "footer.terms": "Terms",
    "footer.disclaimer": "Disclaimer",
    "footer.contact": "Contact",
    "footer.feedback": "Send feedback",
    "footer.publicNotice": "For publicly accessible Instagram and YouTube content only.",
    "legal.privacy.title": "Privacy at InstaFetch",
    "legal.privacy.intro":
      "InstaFetch is designed to resolve public Instagram and YouTube links without asking for account credentials.",
    "legal.terms.title": "Terms of use",
    "legal.terms.intro":
      "Use InstaFetch responsibly and only with media you are allowed to access and save.",
    "legal.disclaimer.title": "Disclaimer",
    "legal.disclaimer.intro":
      "InstaFetch is an independent utility for publicly accessible media.",
    "legal.contact.title": "Contact InstaFetch",
    "legal.contact.intro":
      "Have a product question or found a broken public-media flow?",
    "legal.englishNotice":
      "Detailed legal text is provided in English for accuracy.",
    "error.INVALID_INSTAGRAM_URL":
      "That link does not look like a supported public Instagram or YouTube URL.",
    "error.INVALID_YOUTUBE_URL":
      "That link does not look like a supported public YouTube video or Shorts URL.",
    "error.PLAYLIST_NOT_SUPPORTED":
      "Playlist links are not supported. Paste one YouTube video link at a time.",
    "error.MEDIA_TOO_LONG": "Videos longer than 20 minutes are not supported.",
    "error.PRIVATE_MEDIA": "This YouTube video is private or unavailable.",
    "error.AGE_RESTRICTED": "Age-restricted YouTube videos are not available anonymously.",
    "error.LIVE_NOT_AVAILABLE": "Live YouTube streams are not supported.",
    "error.DRM_UNSUPPORTED": "DRM-protected media is not supported.",
    "error.UNSUPPORTED_MEDIA": "No downloadable public video format was exposed.",
    "error.PRIVATE_OR_UNAVAILABLE":
      "This media is private or unavailable. Only public content can be downloaded.",
    "error.LOGIN_REQUIRED":
      "This media is not available for anonymous download. The platform may require login for this content.",
    "error.YOUTUBE_LOGIN_REQUIRED":
      "YouTube did not allow anonymous access to this video from the current server. You can try another public video later.",
    "error.RATE_LIMITED":
      "The service is busy right now. Wait a moment, then try again.",
    "error.SERVER_BUSY": "Server is busy right now. Please try again shortly.",
    "error.EXTRACTION_TIMEOUT":
      "The public media check timed out. Please try again.",
    "error.EXTRACTION_FAILED":
      "We could not resolve that media. Availability depends on what the platform exposes publicly without login.",
    "error.PROVIDER_UNAVAILABLE":
      "The media service is waking up or temporarily unavailable. Please try again shortly.",
    "error.PROVIDER_MALFORMED_RESPONSE":
      "That link did not return a usable public media result.",
    "error.NETWORK_FAILURE":
      "We could not reach InstaFetch. Check your connection and try again.",
    "error.INVALID_TOKEN":
      "This preview link is invalid. Resolve the post again to create a fresh link.",
    "error.EXPIRED_TOKEN":
      "This download link has expired. Resolve the post again to create a fresh link.",
    "error.MEDIA_NOT_FOUND":
      "This media is no longer in the temporary download window.",
    "error.MEDIA_UNAVAILABLE":
      "This media is no longer available. Resolve the link again for a fresh result.",
    "error.MEDIA_TOO_LARGE":
      "This file is larger than the safe processing limit. Try another item.",
    "error.UPSTREAM_TIMEOUT":
      "Preparing the media timed out. Please try again.",
    "error.UPSTREAM_INVALID_CONTENT":
      "The provider did not return a valid media file. Please try again.",
    "error.DOWNLOAD_FAILED":
      "The download could not be prepared. Resolve the link again and retry.",
    "error.fallback": "Something went wrong. Please try again.",
    "meta.home.title": "Instagram Reel Downloader · YouTube Beta – InstaFetch",
    "meta.home.description":
      "Download publicly accessible Instagram Reels with preview and the best available quality. YouTube is in beta; other media remains conditional on anonymous availability.",
    "meta.privacy.title": "Privacy · InstaFetch",
    "meta.privacy.description":
      "Learn how InstaFetch handles public Instagram and YouTube links, temporary media, and privacy-safe requests.",
    "meta.terms.title": "Terms of use · InstaFetch",
    "meta.terms.description":
      "Read the InstaFetch terms for responsible use of publicly accessible Instagram media.",
    "meta.disclaimer.title": "Disclaimer · InstaFetch",
    "meta.disclaimer.description":
      "Important availability, responsibility, and independence information for InstaFetch.",
    "meta.contact.title": "Contact · InstaFetch",
    "meta.contact.description":
      "Contact guidance for reporting issues with the InstaFetch public-media utility.",
  },
  es: {
    language: "Idioma",
    primaryNavigation: "Navegación principal",
    mobileNavigation: "Navegación móvil",
    "menu.open": "Abrir menú",
    "menu.close": "Cerrar menú",
    skipToContent: "Saltar al contenido",
    "brand.home": "Inicio de InstaFetch",
    "nav.video": "Vídeo",
    "nav.photo": "Foto",
    "nav.reels": "Reels",
    "nav.story": "Historia",
    "nav.carousel": "Carrusel",
    "nav.faq": "Preguntas frecuentes",
    "hero.kicker": "Reels verificados · YouTube en beta",
    "hero.title": "Descargador de",
    "hero.titleAccent": "Instagram",
    "hero.description":
      "Descargas verificadas de Reels de Instagram. YouTube está en beta y otros medios pueden funcionar cuando se expone un archivo genuino sin iniciar sesión.",
    "hero.noLogin": "Sin inicio de sesión",
    "hero.bestQuality": "Mejor calidad disponible",
    "hero.otherMedia": "Otros medios cuando estén disponibles",
    "input.label": "URL de Instagram o YouTube",
    "input.placeholder": "Pega aquí un enlace de Instagram o YouTube",
    "input.help":
      "Solo enlaces públicos. La disponibilidad depende de lo que cada plataforma exponga sin iniciar sesión.",
    "input.paste": "Pegar",
    "input.clear": "Borrar",
    "input.clearAria": "Borrar URL de Instagram o YouTube",
    "input.pasted": "Enlace pegado",
    "input.clipboardEmpty": "El portapapeles está vacío",
    "input.clipboardDenied":
      "Permite el acceso al portapapeles para pegar automáticamente",
    "input.resolving": "Resolviendo…",
    "panel.footnote": "Solo contenido público · Sin inicio de sesión · No se admiten listas",
    "feedback.prompt": "¿Encontraste un problema? Envía comentarios",
    "feedback.helper":
      "Comparte la plataforma, el tipo de enlace, el navegador o dispositivo, el mensaje de error seguro y si funcionaron la vista previa o la descarga. Nunca incluyas contraseñas, cookies, enlaces privados, tokens ni información personal.",
    "feedback.emailBug": "Enviar un informe de error por correo",
    "feedback.emailFeature": "Enviar una solicitud de mejora por correo",
    "feedback.openBug": "Abrir formulario de error de GitHub",
    "feedback.openFeature": "Abrir formulario de mejora de GitHub",
    "feedback.collaboratorLabel": "Para testers/colaboradores invitados",
    "feedback.privacyWarning":
      "No envíes contraseñas, cookies, tokens de autenticación, enlaces privados de medios ni otra información sensible.",
    "feedback.accessNote":
      "Usa los enlaces de correo para recibir soporte público. Los formularios de GitHub son para testers y colaboradores invitados.",
    "input.download": "Descargar",
    "status.processing":
      "Comprobando la publicación pública y preparando los medios disponibles…",
    "status.waking":
      "El servidor se está despertando. Esto puede tardar hasta un minuto en el plan gratuito.",
    "status.keepTab":
      "Mantén esta pestaña abierta mientras terminamos la solicitud.",
    "status.errorHeading": "No pudimos obtener ese enlace",
    "status.tryAgain": "Intentar de nuevo",
    "preview.loading": "Cargando vista previa…",
    "preview.unavailable": "Vista previa no disponible",
    "preview.hint":
      "Prueba el botón de descarga o vuelve a resolver el enlace.",
    "media.video": "Vídeo",
    "media.photo": "Foto",
    "media.item": "Elemento",
    "media.of": "de",
    "media.originalQuality": "Calidad original",
    "download.video": "Descargar vídeo",
    "download.photo": "Descargar foto",
    "download.preparing": "Preparando…",
    "download.downloaded": "Descargado",
    "download.retry": "Reintentar descarga",
    "results.eyebrow": "Listo para descargar",
    "results.of": "de",
    "results.itemsFound": "elementos encontrados",
    "results.itemsAvailable": "elementos disponibles",
    "results.mediaReady": "Tu contenido está listo",
    "results.sharedBy": "Compartido por",
    "results.publicMedia": "Contenido público de Instagram o YouTube",
    "results.partial": "Algunos elementos del carrusel no están disponibles.",
    "principles.label": "Principios de InstaFetch",
    "principles.public": "Público por diseño",
    "principles.publicDetail": "Sin acceso a cuentas privadas",
    "principles.real": "Medios reales",
    "principles.realDetail": "Sin enlaces de ejemplo",
    "principles.anywhere": "Listo en cualquier pantalla",
    "principles.anywhereDetail": "La disponibilidad puede variar",
    "how.eyebrow": "Cómo funciona",
    "how.heading": "Del enlace al contenido guardado, sin complicaciones.",
    "how.intro":
      "Tres pasos sencillos mantienen clara la experiencia y te dejan controlar lo que descargas.",
    "how.step1.title": "Copia el enlace",
    "how.step1.text":
      "Copia la URL de una publicación, Reel, foto o carrusel público de Instagram, o de un vídeo de YouTube.",
    "how.step2.title": "Pégalo aquí",
    "how.step2.text":
      "Pega el enlace en InstaFetch y comprueba la disponibilidad anónima del contenido público.",
    "how.step3.title": "Previsualiza y descarga",
    "how.step3.text":
      "Revisa cada resultado disponible y guarda el contenido genuino que necesites.",
    "benefits.eyebrow": "Una mejor forma de guardar",
    "benefits.heading": "Útil desde el primer momento.",
    "benefits.intro":
      "InstaFetch mantiene visibles los detalles importantes y acorta el camino hasta la descarga.",
    "benefits.quick.title": "Procesamiento rápido",
    "benefits.quick.text":
      "Un flujo directo del enlace al contenido, con menos espera.",
    "benefits.screen.title": "Para todas las pantallas",
    "benefits.screen.text":
      "Un descargador cómodo en móviles, tabletas y ordenadores.",
    "benefits.quality.title": "Calidad de origen",
    "benefits.quality.text":
      "Mostramos el formato legítimo de mayor calidad que expone el proveedor.",
    "benefits.privacy.title": "Privacidad primero",
    "benefits.privacy.text":
      "No se solicitan contraseñas, cookies ni inicios de sesión de Instagram.",
    "supported.eyebrow": "Contenido compatible",
    "supported.heading":
      "Trae el enlace. Mostraremos lo que realmente esté disponible.",
    "supported.intro":
      "Los Reels verificados son nuestro camino más claro. YouTube está en beta; los demás formatos dependen de lo que cada plataforma exponga anónimamente.",
    "supported.video.status": "Compatible cuando es público",
    "supported.video.title": "Descargador de vídeos de Instagram",
    "supported.video.text":
      "El vídeo público se puede descargar cuando Instagram expone un archivo genuino sin iniciar sesión.",
    "supported.photo.status": "Limitado / depende del acceso de Instagram",
    "supported.photo.title": "Descargador de fotos de Instagram",
    "supported.photo.text":
      "La disponibilidad de fotos varía según la publicación y los medios que Instagram exponga anónimamente.",
    "supported.reels.status": "Verificado",
    "supported.reels.title": "Descargador de Reels de Instagram",
    "supported.reels.text":
      "Los Reels públicos están verificados con vistas previas y descargas reales.",
    "supported.story.status": "Limitado / compatibilidad variable",
    "supported.story.title": "Descargador de historias de Instagram",
    "supported.story.text":
      "Una historia pública solo funciona cuando es accesible sin autenticación.",
    "supported.carousel.status": "Limitado / compatibilidad variable",
    "supported.carousel.title": "Descargador de carruseles de Instagram",
    "supported.carousel.text":
      "Los elementos se muestran por separado cuando el proveedor público expone cada recurso.",
    "supported.youtube.status": "Beta / solo vídeos públicos",
    "supported.youtube.title": "Descargador de vídeos de YouTube",
    "supported.youtube.text":
      "Los vídeos públicos de YouTube de hasta 20 minutos funcionan cuando hay formatos anónimos disponibles.",
    "supported.shorts.status": "Beta / solo Shorts públicos",
    "supported.shorts.title": "Descargador de YouTube Shorts",
    "supported.shorts.text":
      "Los Shorts usan el mismo flujo seguro y dependen de la disponibilidad del formato.",
    "supported.learn": "Cómo funciona",
    "faq.eyebrow": "Preguntas y respuestas",
    "faq.heading": "Lo que conviene saber antes de descargar.",
    "faq.intro":
      "Las expectativas claras ayudan a que las herramientas de contenido público sigan siendo útiles y responsables.",
    "faq.q1": "¿Qué puede descargar InstaFetch?",
    "faq.a1":
      "Los Reels públicos están verificados. Los vídeos, fotos, carruseles, historias y enlaces TV antiguos dependen de la disponibilidad anónima.",
    "faq.q2": "¿Por qué puede fallar una publicación pública?",
    "faq.a2":
      "Una publicación puede verse en un navegador y aun así pedir iniciar sesión o no exponer un archivo descargable a herramientas anónimas.",
    "faq.q3": "¿Por qué funcionan los Reels y algunas fotos no?",
    "faq.a3":
      "Instagram expone formatos distintos según el tipo de publicación. El acceso anónimo puede funcionar para un Reel y no para una foto.",
    "faq.q4": "¿InstaFetch usa mi inicio de sesión de Instagram?",
    "faq.a4":
      "No. InstaFetch no solicita ni usa contraseñas, cookies, perfiles de navegador ni tokens de autenticación.",
    "faq.q5": "¿Se pueden descargar publicaciones privadas?",
    "faq.a5":
      "No. InstaFetch no sortea cuentas privadas ni controles de acceso.",
    "faq.q6": "¿Qué calidad obtendré?",
    "faq.a6":
      "Seleccionamos el formato legítimo de mayor calidad que devuelve el proveedor público y mostramos su resolución.",
    "faq.q7": "¿Funciona en móviles?",
    "faq.a7":
      "Sí. La interfaz está pensada para pantallas táctiles y navegadores móviles compatibles.",
    "faq.q8": "¿Por qué cambia la disponibilidad?",
    "faq.a8":
      "La disponibilidad, los límites y los formatos anónimos de Instagram pueden cambiar. InstaFetch informa del resultado actual sin saltarse esos límites.",
    "faq.q9": "¿Cuánto duran los enlaces?",
    "faq.a9":
      "Los enlaces de vista previa y descarga son temporales. Resuelve de nuevo la URL si caduca.",
    "closing.kicker": "Cuando quieras",
    "closing.heading": "¿Tienes un enlace público?",
    "closing.text": "Vuelve arriba y empieza una vista previa nueva.",
    "closing.cta": "Empezar descarga",
    "footer.tagline": "Contenido público, sin complicaciones.",
    "footer.credit": "Crafted with love ❤️ by Aman Sharma",
    "footer.explore": "Explorar",
    "footer.info": "Información",
    "footer.privacy": "Privacidad",
    "footer.terms": "Términos",
    "footer.disclaimer": "Aviso",
    "footer.contact": "Contacto",
    "footer.feedback": "Enviar comentarios",
    "footer.publicNotice": "Solo para contenido público de Instagram y YouTube.",
    "legal.privacy.title": "Privacidad en InstaFetch",
    "legal.privacy.intro":
      "InstaFetch resuelve enlaces públicos de Instagram y YouTube sin pedir credenciales de la cuenta.",
    "legal.terms.title": "Términos de uso",
    "legal.terms.intro":
      "Usa InstaFetch de forma responsable y solo con contenido que puedas guardar legalmente.",
    "legal.disclaimer.title": "Aviso",
    "legal.disclaimer.intro":
      "InstaFetch es una herramienta independiente para contenido público.",
    "legal.contact.title": "Contacta con InstaFetch",
    "legal.contact.intro": "¿Tienes una pregunta o encontraste un problema?",
    "legal.englishNotice":
      "El texto legal detallado se muestra en inglés para mantener su precisión.",
    "meta.home.title": "Descargador de Reels · YouTube en beta – InstaFetch",
    "meta.home.description":
      "Descarga Reels públicos de Instagram con vista previa y la mejor calidad disponible. YouTube está en beta; otros medios dependen de la disponibilidad anónima.",
    "meta.privacy.title": "Privacidad · InstaFetch",
    "meta.privacy.description":
      "Cómo InstaFetch gestiona enlaces públicos de Instagram, YouTube y archivos temporales.",
    "meta.terms.title": "Términos de uso · InstaFetch",
    "meta.terms.description":
      "Condiciones para usar InstaFetch con contenido público de Instagram.",
    "meta.disclaimer.title": "Aviso · InstaFetch",
    "meta.disclaimer.description":
      "Información sobre disponibilidad y uso responsable de InstaFetch.",
    "meta.contact.title": "Contacto · InstaFetch",
    "meta.contact.description":
      "Orientación para contactar sobre problemas con InstaFetch.",
    "error.INVALID_INSTAGRAM_URL": "Ese enlace no parece una URL pública compatible de Instagram o YouTube.",
    "error.INVALID_YOUTUBE_URL": "Ese enlace no parece un vídeo o Short público de YouTube compatible.",
    "error.PLAYLIST_NOT_SUPPORTED": "No se admiten listas. Pega un enlace de vídeo de YouTube cada vez.",
    "error.MEDIA_TOO_LONG": "No se admiten vídeos de más de 20 minutos.",
    "error.PRIVATE_MEDIA": "Este vídeo de YouTube es privado o no está disponible.",
    "error.AGE_RESTRICTED": "Los vídeos de YouTube con restricción de edad no están disponibles anónimamente.",
    "error.LIVE_NOT_AVAILABLE": "No se admiten transmisiones en directo de YouTube.",
    "error.DRM_UNSUPPORTED": "No se admite contenido protegido por DRM.",
    "error.UNSUPPORTED_MEDIA": "No se expuso ningún formato de vídeo público descargable.",
    "error.PRIVATE_OR_UNAVAILABLE": "Este contenido es privado o no está disponible. Solo se puede descargar contenido público.",
    "error.LOGIN_REQUIRED": "Este contenido no está disponible para descarga anónima. La plataforma puede requerir iniciar sesión.",
    "error.YOUTUBE_LOGIN_REQUIRED": "YouTube no permitió el acceso anónimo a este vídeo desde el servidor actual. Puedes probar otro vídeo público más tarde.",
    "error.RATE_LIMITED": "El servicio está ocupado. Espera un momento e inténtalo de nuevo.",
    "error.SERVER_BUSY": "El servidor está ocupado. Inténtalo de nuevo en unos momentos.",
    "error.EXTRACTION_TIMEOUT": "La comprobación del contenido público tardó demasiado. Inténtalo de nuevo.",
    "error.EXTRACTION_FAILED": "No pudimos resolver ese contenido. La disponibilidad depende de lo que la plataforma exponga sin iniciar sesión.",
    "error.PROVIDER_UNAVAILABLE": "El servicio de medios no está disponible temporalmente. Inténtalo de nuevo pronto.",
    "error.PROVIDER_MALFORMED_RESPONSE": "Ese enlace no devolvió un resultado de contenido público utilizable.",
    "error.NETWORK_FAILURE": "No pudimos conectar con InstaFetch. Comprueba tu conexión e inténtalo de nuevo.",
    "error.INVALID_TOKEN": "Este enlace de vista previa no es válido. Resuelve la publicación de nuevo.",
    "error.EXPIRED_TOKEN": "Este enlace de descarga ha caducado. Resuelve la publicación de nuevo.",
    "error.MEDIA_NOT_FOUND": "Este contenido ya no está en la ventana temporal de descarga.",
    "error.MEDIA_UNAVAILABLE": "Este contenido ya no está disponible. Resuelve el enlace de nuevo.",
    "error.MEDIA_TOO_LARGE": "El archivo supera el límite de procesamiento seguro.",
    "error.UPSTREAM_TIMEOUT": "La preparación del contenido tardó demasiado. Inténtalo de nuevo.",
    "error.UPSTREAM_INVALID_CONTENT": "El proveedor no devolvió un archivo de contenido válido.",
    "error.DOWNLOAD_FAILED": "No se pudo preparar la descarga. Resuelve el enlace de nuevo e inténtalo.",
    "error.fallback": "Algo salió mal. Inténtalo de nuevo.",
  },
  fr: {
    language: "Langue",
    primaryNavigation: "Navigation principale",
    mobileNavigation: "Navigation mobile",
    "menu.open": "Ouvrir le menu",
    "menu.close": "Fermer le menu",
    skipToContent: "Aller au contenu",
    "brand.home": "Accueil InstaFetch",
    "nav.video": "Vidéo",
    "nav.photo": "Photo",
    "nav.reels": "Reels",
    "nav.story": "Story",
    "nav.carousel": "Carrousel",
    "nav.faq": "FAQ",
    "hero.kicker": "Reels vérifiés · YouTube en bêta",
    "hero.title": "Téléchargeur",
    "hero.titleAccent": "Instagram",
    "hero.description":
      "Téléchargements vérifiés de Reels Instagram. YouTube est en bêta et les autres médias dépendent d’un fichier authentique exposé sans connexion.",
    "hero.noLogin": "Sans connexion",
    "hero.bestQuality": "Meilleure qualité disponible",
    "hero.otherMedia": "Autres médias si disponibles",
    "input.label": "URL Instagram ou YouTube",
    "input.placeholder": "Collez un lien Instagram ou YouTube ici",
    "input.help":
      "Liens publics uniquement. La disponibilité dépend de ce que chaque plateforme expose sans connexion.",
    "input.paste": "Coller",
    "input.clear": "Effacer",
    "input.clearAria": "Effacer l’URL Instagram ou YouTube",
    "input.pasted": "Lien collé",
    "input.clipboardEmpty": "Le presse-papiers est vide",
    "input.clipboardDenied":
      "Autorisez le presse-papiers pour coller automatiquement",
    "input.resolving": "Résolution…",
    "panel.footnote": "Contenu public uniquement · Sans connexion · Les playlists ne sont pas prises en charge",
    "feedback.prompt": "Un problème ? Envoyez vos commentaires",
    "feedback.helper":
      "Indiquez la plateforme, le type de lien, le navigateur ou l’appareil, le message d’erreur non sensible et si l’aperçu ou le téléchargement a fonctionné. N’incluez jamais de mots de passe, cookies, liens privés, jetons ni informations personnelles.",
    "feedback.emailBug": "Envoyer un rapport de bug par e-mail",
    "feedback.emailFeature": "Envoyer une demande de fonctionnalité par e-mail",
    "feedback.openBug": "Ouvrir le formulaire de bug GitHub",
    "feedback.openFeature": "Ouvrir le formulaire de fonctionnalité GitHub",
    "feedback.collaboratorLabel": "Pour les testeurs/collaborateurs invités",
    "feedback.privacyWarning":
      "N’envoyez pas de mots de passe, cookies, jetons d’authentification, liens privés de médias ni autres informations sensibles.",
    "feedback.accessNote":
      "Utilisez les liens e-mail pour le support public. Les formulaires GitHub sont réservés aux testeurs et collaborateurs invités.",
    "input.download": "Télécharger",
    "status.processing":
      "Vérification de la publication publique et préparation des médias disponibles…",
    "status.waking":
      "Le serveur se réveille. Cela peut prendre jusqu’à une minute avec l’hébergement gratuit.",
    "status.keepTab": "Gardez cet onglet ouvert pendant la requête.",
    "status.errorHeading": "Impossible de récupérer ce lien",
    "status.tryAgain": "Réessayer",
    "preview.loading": "Chargement de l’aperçu…",
    "preview.unavailable": "Aperçu indisponible",
    "preview.hint":
      "Essayez le bouton de téléchargement ou résolvez à nouveau le lien.",
    "media.video": "Vidéo",
    "media.photo": "Photo",
    "media.item": "Élément",
    "media.of": "sur",
    "media.originalQuality": "Qualité d’origine",
    "download.video": "Télécharger la vidéo",
    "download.photo": "Télécharger la photo",
    "download.preparing": "Préparation…",
    "download.downloaded": "Téléchargé",
    "download.retry": "Réessayer le téléchargement",
    "results.eyebrow": "Prêt à télécharger",
    "results.of": "sur",
    "results.itemsFound": "éléments trouvés",
    "results.itemsAvailable": "éléments disponibles",
    "results.mediaReady": "Votre média est prêt",
    "results.sharedBy": "Partagé par",
    "results.publicMedia": "Média public Instagram ou YouTube",
    "results.partial": "Certains éléments du carrousel sont indisponibles.",
    "principles.label": "Principes InstaFetch",
    "principles.public": "Public par conception",
    "principles.publicDetail": "Aucun accès privé",
    "principles.real": "Médias réels",
    "principles.realDetail": "Aucun lien fictif",
    "principles.anywhere": "Sur tous vos écrans",
    "principles.anywhereDetail": "La disponibilité peut varier",
    "how.eyebrow": "Comment ça marche",
    "how.heading": "Du lien au média enregistré, simplement.",
    "how.intro":
      "Trois étapes gardent l’expérience claire et vous laissent contrôler ce qui est téléchargé.",
    "how.step1.title": "Copiez le lien",
    "how.step1.text":
      "Copiez l’URL d’une publication, d’un Reel, d’une photo ou d’un carrousel Instagram public, ou d’une vidéo YouTube.",
    "how.step2.title": "Collez-le ici",
    "how.step2.text":
      "Collez le lien dans InstaFetch et vérifiez la disponibilité anonyme du média public.",
    "how.step3.title": "Prévisualisez et téléchargez",
    "how.step3.text":
      "Vérifiez chaque résultat disponible puis enregistrez le média authentique souhaité.",
    "benefits.eyebrow": "Une meilleure sauvegarde",
    "benefits.heading": "Utile par défaut.",
    "benefits.intro":
      "InstaFetch garde les informations importantes visibles et raccourcit le chemin vers le téléchargement.",
    "benefits.quick.title": "Traitement rapide",
    "benefits.quick.text":
      "Un parcours concentré du lien au média, avec moins d’attente.",
    "benefits.screen.title": "Pour chaque écran",
    "benefits.screen.text":
      "Un téléchargeur confortable sur téléphone, tablette et ordinateur.",
    "benefits.quality.title": "Qualité source",
    "benefits.quality.text":
      "Nous affichons le meilleur format légitime exposé par le fournisseur.",
    "benefits.privacy.title": "Respect de la vie privée",
    "benefits.privacy.text":
      "Aucun mot de passe, cookie ou accès Instagram n’est demandé.",
    "supported.eyebrow": "Contenus pris en charge",
    "supported.heading":
      "Apportez le lien. Nous montrerons ce qui est vraiment disponible.",
    "supported.intro":
      "Les Reels vérifiés sont notre parcours le plus clair. YouTube est en bêta ; les autres formats dépendent de ce que chaque plateforme expose anonymement.",
    "supported.video.status": "Pris en charge si public",
    "supported.video.title": "Téléchargeur de vidéos Instagram",
    "supported.video.text":
      "Les vidéos publiques sont téléchargeables lorsqu’Instagram expose un fichier authentique sans connexion.",
    "supported.photo.status": "Limité / dépend de l’accès Instagram",
    "supported.photo.title": "Téléchargeur de photos Instagram",
    "supported.photo.text":
      "La disponibilité des photos varie selon la publication et les médias exposés anonymement.",
    "supported.reels.status": "Vérifié",
    "supported.reels.title": "Téléchargeur de Reels Instagram",
    "supported.reels.text":
      "Les Reels publics sont vérifiés avec des aperçus et des téléchargements réels.",
    "supported.story.status": "Limité / compatibilité variable",
    "supported.story.title": "Téléchargeur de Stories Instagram",
    "supported.story.text":
      "Une Story publique fonctionne uniquement lorsqu’elle est accessible sans authentification.",
    "supported.carousel.status": "Limité / compatibilité variable",
    "supported.carousel.title": "Téléchargeur de carrousels Instagram",
    "supported.carousel.text":
      "Les éléments sont affichés séparément lorsque le fournisseur public expose chaque ressource.",
    "supported.youtube.status": "Bêta / vidéos publiques uniquement",
    "supported.youtube.title": "Téléchargeur de vidéos YouTube",
    "supported.youtube.text":
      "Les vidéos YouTube publiques de moins de 20 minutes fonctionnent lorsque des formats anonymes sont disponibles.",
    "supported.shorts.status": "Bêta / Shorts publics uniquement",
    "supported.shorts.title": "Téléchargeur de YouTube Shorts",
    "supported.shorts.text":
      "Les Shorts utilisent le même parcours sécurisé et dépendent de la disponibilité du format.",
    "supported.learn": "Voir le fonctionnement",
    "faq.eyebrow": "Questions et réponses",
    "faq.heading": "À savoir avant de télécharger.",
    "faq.intro":
      "Des attentes claires rendent les outils de médias publics plus utiles et responsables.",
    "faq.q1": "Que peut télécharger InstaFetch ?",
    "faq.a1":
      "Les Reels publics sont vérifiés. Les vidéos, photos, carrousels, Stories et anciens liens TV dépendent de la disponibilité anonyme.",
    "faq.q2": "Pourquoi une publication publique peut-elle échouer ?",
    "faq.a2":
      "Une publication peut être visible dans un navigateur tout en exigeant une connexion ou en n’exposant aucun fichier téléchargeable anonymement.",
    "faq.q3":
      "Pourquoi les Reels fonctionnent-ils quand certaines photos échouent ?",
    "faq.a3":
      "Instagram expose des formats différents selon le type de publication. L’accès anonyme peut fonctionner pour un Reel mais pas pour une photo.",
    "faq.q4": "InstaFetch utilise-t-il ma connexion Instagram ?",
    "faq.a4":
      "Non. InstaFetch ne demande ni mots de passe, ni cookies, ni profils de navigateur, ni jetons d’authentification.",
    "faq.q5": "Peut-on télécharger des publications privées ?",
    "faq.a5":
      "Non. InstaFetch ne contourne pas les comptes privés ni les contrôles d’accès.",
    "faq.q6": "Quelle qualité vais-je obtenir ?",
    "faq.a6":
      "Nous sélectionnons le meilleur format légitime retourné par le fournisseur public et affichons sa résolution.",
    "faq.q7": "Est-ce compatible avec le mobile ?",
    "faq.a7":
      "Oui. L’interface est pensée pour les écrans tactiles et les navigateurs mobiles compatibles.",
    "faq.q8": "Pourquoi la disponibilité change-t-elle ?",
    "faq.a8":
      "La disponibilité, les limites et les formats exposés anonymement par Instagram peuvent changer. InstaFetch rapporte le résultat actuel sans les contourner.",
    "faq.q9": "Combien de temps les liens restent-ils valides ?",
    "faq.a9":
      "Les liens d’aperçu et de téléchargement sont temporaires. Résolvez à nouveau l’URL si elle a expiré.",
    "closing.kicker": "Quand vous voulez",
    "closing.heading": "Vous avez un lien public ?",
    "closing.text": "Revenez en haut pour commencer un nouvel aperçu.",
    "closing.cta": "Commencer le téléchargement",
    "footer.tagline": "Les médias publics, simplement.",
    "footer.credit": "Crafted with love ❤️ by Aman Sharma",
    "footer.explore": "Explorer",
    "footer.info": "Infos",
    "footer.privacy": "Confidentialité",
    "footer.terms": "Conditions",
    "footer.disclaimer": "Avertissement",
    "footer.contact": "Contact",
    "footer.feedback": "Envoyer un commentaire",
    "footer.publicNotice": "Pour les contenus Instagram et YouTube publics uniquement.",
    "legal.privacy.title": "Confidentialité chez InstaFetch",
    "legal.privacy.intro":
      "InstaFetch résout les liens publics Instagram et YouTube sans demander les identifiants du compte.",
    "legal.terms.title": "Conditions d’utilisation",
    "legal.terms.intro":
      "Utilisez InstaFetch de manière responsable avec les médias que vous pouvez enregistrer.",
    "legal.disclaimer.title": "Avertissement",
    "legal.disclaimer.intro":
      "InstaFetch est un outil indépendant pour les médias publics.",
    "legal.contact.title": "Contacter InstaFetch",
    "legal.contact.intro": "Une question ou un problème avec un flux public ?",
    "legal.englishNotice":
      "Le texte juridique détaillé est fourni en anglais pour préserver sa précision.",
    "meta.home.title": "Téléchargeur de Reels · YouTube en bêta – InstaFetch",
    "meta.home.description":
      "Téléchargez des Reels Instagram publics avec aperçu et la meilleure qualité disponible. YouTube est en bêta ; les autres médias dépendent de la disponibilité anonyme.",
    "meta.privacy.title": "Confidentialité · InstaFetch",
    "meta.privacy.description":
      "Comment InstaFetch traite les liens publics Instagram et YouTube et les fichiers temporaires.",
    "meta.terms.title": "Conditions d’utilisation · InstaFetch",
    "meta.terms.description":
      "Conditions d’utilisation responsable des médias Instagram publics avec InstaFetch.",
    "meta.disclaimer.title": "Avertissement · InstaFetch",
    "meta.disclaimer.description":
      "Informations sur la disponibilité et l’utilisation responsable d’InstaFetch.",
    "meta.contact.title": "Contact · InstaFetch",
    "meta.contact.description":
      "Conseils pour signaler un problème avec InstaFetch.",
    "error.INVALID_INSTAGRAM_URL": "Ce lien ne ressemble pas à une URL publique Instagram ou YouTube compatible.",
    "error.INVALID_YOUTUBE_URL": "Ce lien ne ressemble pas à une vidéo ou un Short YouTube public compatible.",
    "error.PLAYLIST_NOT_SUPPORTED": "Les playlists ne sont pas prises en charge. Collez un lien vidéo YouTube à la fois.",
    "error.MEDIA_TOO_LONG": "Les vidéos de plus de 20 minutes ne sont pas prises en charge.",
    "error.PRIVATE_MEDIA": "Cette vidéo YouTube est privée ou indisponible.",
    "error.AGE_RESTRICTED": "Les vidéos YouTube soumises à une restriction d’âge ne sont pas disponibles anonymement.",
    "error.LIVE_NOT_AVAILABLE": "Les diffusions YouTube en direct ne sont pas prises en charge.",
    "error.DRM_UNSUPPORTED": "Les médias protégés par DRM ne sont pas pris en charge.",
    "error.UNSUPPORTED_MEDIA": "Aucun format vidéo public téléchargeable n’a été exposé.",
    "error.PRIVATE_OR_UNAVAILABLE": "Ce média est privé ou indisponible. Seul le contenu public peut être téléchargé.",
    "error.LOGIN_REQUIRED": "Ce média n’est pas disponible pour un téléchargement anonyme. La plateforme peut demander une connexion.",
    "error.YOUTUBE_LOGIN_REQUIRED": "YouTube n’a pas autorisé l’accès anonyme à cette vidéo depuis le serveur actuel. Vous pouvez essayer une autre vidéo publique plus tard.",
    "error.RATE_LIMITED": "Le service est occupé. Attendez un instant puis réessayez.",
    "error.SERVER_BUSY": "Le serveur est occupé. Réessayez dans un moment.",
    "error.EXTRACTION_TIMEOUT": "La vérification du média public a expiré. Réessayez.",
    "error.EXTRACTION_FAILED": "Impossible de résoudre ce média. La disponibilité dépend de ce que la plateforme expose sans connexion.",
    "error.PROVIDER_UNAVAILABLE": "Le service média est temporairement indisponible. Réessayez bientôt.",
    "error.PROVIDER_MALFORMED_RESPONSE": "Ce lien n’a pas renvoyé de résultat média public utilisable.",
    "error.NETWORK_FAILURE": "Impossible de joindre InstaFetch. Vérifiez votre connexion puis réessayez.",
    "error.INVALID_TOKEN": "Ce lien d’aperçu est invalide. Résolvez à nouveau la publication.",
    "error.EXPIRED_TOKEN": "Ce lien de téléchargement a expiré. Résolvez à nouveau la publication.",
    "error.MEDIA_NOT_FOUND": "Ce média n’est plus dans la fenêtre de téléchargement temporaire.",
    "error.MEDIA_UNAVAILABLE": "Ce média n’est plus disponible. Résolvez à nouveau le lien.",
    "error.MEDIA_TOO_LARGE": "Le fichier dépasse la limite de traitement sécurisée.",
    "error.UPSTREAM_TIMEOUT": "La préparation du média a expiré. Réessayez.",
    "error.UPSTREAM_INVALID_CONTENT": "Le fournisseur n’a pas renvoyé de fichier média valide.",
    "error.DOWNLOAD_FAILED": "Le téléchargement n’a pas pu être préparé. Résolvez le lien et réessayez.",
    "error.fallback": "Une erreur s’est produite. Réessayez.",
  },
};

export function translate(locale: Locale, key: string): string {
  return messages[locale][key] ?? messages.en[key] ?? key;
}

export function hasTranslation(locale: Locale, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(messages[locale], key);
}

function readStoredLocale(): Locale {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "es" || value === "fr" ? value : "en";
  } catch {
    return "en";
  }
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Preference persistence is optional when storage is blocked.
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      t: (key: string) => translate(locale, key),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within LanguageProvider");
  return value;
}
