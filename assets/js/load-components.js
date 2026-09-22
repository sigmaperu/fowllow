const COMPONENTS = [
  ["sidebar", "../components/sidebar.html"],
  ["navbar", "../components/navbar.html"],
  ["footer", "../components/footer.html"]
];

async function loadComponent(targetId, url) {
  const target = document.getElementById(targetId);
  if (!target) return;

  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`No se pudo cargar ${url} (${response.status})`);
  target.innerHTML = await response.text();
}

function setActiveNavigation() {
  const page = document.body.dataset.page;
  document.querySelectorAll(".nav-item").forEach((link) => {
    const active = link.dataset.page === page;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

async function loadSharedComponents() {
  try {
    await Promise.all(COMPONENTS.map(([id, path]) => loadComponent(id, path)));
    setActiveNavigation();
    document.dispatchEvent(new CustomEvent("components:ready"));
  } catch (error) {
    console.error("Error cargando componentes:", error);
  }
}

document.addEventListener("DOMContentLoaded", loadSharedComponents);
