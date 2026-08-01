const SHELL_URLS = Object.freeze({
  front: `${import.meta.env.BASE_URL}iphone/iphone-shell-front.webp`,
  left: `${import.meta.env.BASE_URL}iphone/iphone-shell-left.webp`,
  right: `${import.meta.env.BASE_URL}iphone/iphone-shell-right.webp`,
});

const loadShell = async (url) => {
  const image = new Image();

  image.decoding = "async";
  image.src = url;

  await image.decode();

  return image;
};

const loadShells = async () =>
  Object.fromEntries(
    await Promise.all(
      Object.entries(SHELL_URLS).map(async ([view, url]) => [
        view,
        await loadShell(url),
      ]),
    ),
  );

const attachShell = (phone, sources) => {
  const hardware = phone.querySelector(".app-phone__hardware");
  const view = phone.dataset.iphoneView ?? "front";
  const source = sources[view] ?? sources.front;

  if (!hardware || !source) {
    return;
  }

  const shell = source.cloneNode();

  shell.className = `app-phone__model-shell app-phone__model-shell--${view}`;
  shell.alt = "";
  shell.draggable = false;
  shell.setAttribute("aria-hidden", "true");
  hardware.prepend(shell);
  phone.classList.add("has-iphone-model");
};

export const initializeIPhoneShells = async (
  phones = document.querySelectorAll(".app-phone"),
) => {
  const phoneElements = [...phones];

  if (phoneElements.length === 0) {
    return;
  }

  try {
    const sources = await loadShells();

    phoneElements.forEach((phone) => attachShell(phone, sources));
  } catch (error) {
    console.warn("Scocca iPhone non disponibile.", error);
  }
};
