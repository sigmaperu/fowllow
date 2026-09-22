const COMPONENTS=[["sidebar","../components/sidebar.html"],["navbar","../components/navbar.html"],["footer","../components/footer.html"]];
async function inject(id,url){const target=document.getElementById(id);if(!target)return;const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error(`${url}: HTTP ${response.status}`);target.innerHTML=await response.text()}
function activateMenu(){const page=document.body.dataset.page;document.querySelectorAll(".gm-nav__item").forEach(link=>{const active=link.dataset.page===page;link.classList.toggle("active",active);active?link.setAttribute("aria-current","page"):link.removeAttribute("aria-current")})}
async function initComponents(){try{await Promise.all(COMPONENTS.map(([id,url])=>inject(id,url)));activateMenu();document.dispatchEvent(new CustomEvent("components:ready"))}catch(error){console.error("No se pudieron cargar los componentes",error)}}
document.addEventListener("DOMContentLoaded",initComponents);
