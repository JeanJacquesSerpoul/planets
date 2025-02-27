let scene, camera, renderer;
let planets = []; // Contiendra chaque planète et ses paramètres
let launchObject = null;  // Objet à lancer (la croix)
let launchVelocity = new THREE.Vector3();
let isLaunched = false;
let isDragging = false;
let dragLine = null;
let simulationSpeed = 1;
let explosion = null;
let explosionTime = 0;
let clock = new THREE.Clock();

// Pour tracer la trajectoire
let trajectoryPoints = [];
let trajectoryLine = null;

// Pour la gestion de la souris/tactile
let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();

// === Variables pour le panoramique et le zoom par pinch ===
let isPanning = false;
let panStartWorld = new THREE.Vector3();
// On utilise cameraTarget pour conserver le point regardé par la caméra
let cameraTarget = new THREE.Vector3(0, 0, 0);
// Variable pour stocker la distance entre deux doigts
let previousPinchDistance = null;

init();
animate();

// Fonction utilitaire pour récupérer les coordonnées (mouse ou tactile)
function getPointerEvent(event) {
    if (event.touches && event.touches.length > 0) {
        return event.touches[0];
    } else if (event.changedTouches && event.changedTouches.length > 0) {
        return event.changedTouches[0];
    }
    return event;
}

// Fonction utilitaire pour obtenir la position sur le plan z=0 à partir de coordonnées client
function getWorldPositionFromClient(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mousePos = new THREE.Vector2();
    mousePos.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mousePos.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mousePos, camera);
    const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const pos = new THREE.Vector3();
    raycaster.ray.intersectPlane(planeZ, pos);
    return pos;
}

function init() {
    // Création de la scène, caméra et renderer
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);

    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        1,
        10000
    );
    camera.position.set(0, 0, 800);
    cameraTarget.set(0, 0, 0);
    camera.lookAt(cameraTarget);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Lumières
    const ambientLight = new THREE.AmbientLight(0x888888);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 100, 200);
    scene.add(dirLight);

    // Création de 3 planètes par défaut
    createPlanet(new THREE.Vector3(-200, 0, 0), 8, 10000, 0x00aaff);
    createPlanet(new THREE.Vector3(200, -50, 0), 8, 10000, 0xffaa00);
    createPlanet(new THREE.Vector3(0, 150, 0), 8, 10000, 0xaaff00);
    // Ajout de la 4ème planète rouge
    createPlanet(new THREE.Vector3(0, -150, 0), 8, 10000, 0xff0000);

    // Création de la ligne de visée (pendant le clic-glisser/tactile)
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3()
    ]);
    dragLine = new THREE.Line(lineGeometry, lineMaterial);
    dragLine.visible = false;
    scene.add(dragLine);

    // Création de la ligne de trajectoire (initialement vide)
    trajectoryPoints = [];
    const trajGeometry = new THREE.BufferGeometry().setFromPoints(
        trajectoryPoints
    );
    const trajMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    trajectoryLine = new THREE.Line(trajGeometry, trajMaterial);
    scene.add(trajectoryLine);

    // Événements pour la gestion de la souris ET du tactile sur le canvas
    renderer.domElement.addEventListener("mousedown", onMouseDown, false);
    renderer.domElement.addEventListener("mousemove", onMouseMove, false);
    renderer.domElement.addEventListener("mouseup", onMouseUp, false);
    renderer.domElement.addEventListener("touchstart", onMouseDown, false);
    renderer.domElement.addEventListener("touchmove", onMouseMove, false);
    renderer.domElement.addEventListener("touchend", onMouseUp, false);

    // Événements pour le déplacement de la zone de contrôles (UI)
    const ui = document.getElementById("ui");
    let isDraggingUI = false;
    let offsetX, offsetY;

    ui.addEventListener("mousedown", onUIDragStart, false);
    document.addEventListener("mousemove", onUIDragMove, false);
    document.addEventListener("mouseup", onUIDragEnd, false);
    ui.addEventListener("touchstart", onUIDragStart, false);
    document.addEventListener("touchmove", onUIDragMove, false);
    document.addEventListener("touchend", onUIDragEnd, false);

    function onUIDragStart(event) {
        const pointer = getPointerEvent(event);
        // Si l'utilisateur clique sur un INPUT ou BUTTON, ne pas lancer le déplacement de la UI
        if (
            event.target.tagName === "INPUT" ||
            event.target.tagName === "BUTTON"
        )
            return;
        event.preventDefault();
        isDraggingUI = true;
        offsetX = pointer.clientX - ui.offsetLeft;
        offsetY = pointer.clientY - ui.offsetTop;
    }

    function onUIDragMove(event) {
        if (!isDraggingUI) return;
        const pointer = getPointerEvent(event);
        event.preventDefault();
        ui.style.left = `${pointer.clientX - offsetX}px`;
        ui.style.top = `${pointer.clientY - offsetY}px`;
    }

    function onUIDragEnd() {
        isDraggingUI = false;
    }

    // Événements pour le déplacement des planètes (souris et tactile)
    renderer.domElement.addEventListener("mousedown", onPlanetMouseDown, false);
    renderer.domElement.addEventListener("mousemove", onPlanetMouseMove, false);
    renderer.domElement.addEventListener("mouseup", onPlanetMouseUp, false);
    renderer.domElement.addEventListener("touchstart", onPlanetMouseDown, false);
    renderer.domElement.addEventListener("touchmove", onPlanetMouseMove, false);
    renderer.domElement.addEventListener("touchend", onPlanetMouseUp, false);

    let draggingPlanet = null;
    let offset = new THREE.Vector3();

    function onPlanetMouseDown(event) {
        if (isPanning) return;
        event.preventDefault();
        const pos = getMousePositionOnPlane(event);
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(
            planets.map((p) => p.mesh)
        );
        if (intersects.length > 0) {
            draggingPlanet = intersects[0].object;
            offset.copy(pos).sub(draggingPlanet.position);
        }
    }

    function onPlanetMouseMove(event) {
        if (isPanning) return;
        if (!draggingPlanet) return;
        const pos = getMousePositionOnPlane(event);
        draggingPlanet.position.copy(pos).sub(offset);
    }

    function onPlanetMouseUp() {
        if (isPanning) return;
        draggingPlanet = null;
    }

    // Bouton reset
    document
        .getElementById("resetBtn")
        .addEventListener("click", resetSimulation);

    // Bouton pour la configuration Terre-Lune (ajouté)
    document
        .getElementById("earthMoonBtn")
        .addEventListener("click", setupEarthMoonConfiguration);

    // Slider de vitesse
    document
        .getElementById("speedSlider")
        .addEventListener("input", (e) => {
            simulationSpeed = parseFloat(e.target.value);
            document.getElementById("speedValue").textContent =
                simulationSpeed;
        });

    // Slider de zoom
    document
        .getElementById("zoomSlider")
        .addEventListener("input", (e) => {
            const zoomLevel = parseFloat(e.target.value);
            camera.zoom = zoomLevel;
            camera.updateProjectionMatrix();
            document.getElementById("zoomValue").textContent = zoomLevel;
        });

    // Nouveau slider pour le rayon des planètes
    document
        .getElementById("radiusSlider")
        .addEventListener("input", (e) => {
            const factor = parseFloat(e.target.value);
            document.getElementById("radiusValue").textContent = factor;
            planets.forEach((planet) => {
                // Met à jour l'échelle du mesh et le rayon utilisé pour la collision
                planet.mesh.scale.set(factor, factor, factor);
                planet.radius = planet.originalRadius * factor;
            });
        });

    // Sliders d'attraction pour chaque planète
    document
        .getElementById("attractionSlider0")
        .addEventListener("input", (e) => {
            const multiplier = parseFloat(e.target.value);
            planets[0].attraction =
                planets[0].originalAttraction * multiplier;
            document.getElementById("attractionValue0").textContent =
                multiplier;
        });

    document
        .getElementById("attractionSlider1")
        .addEventListener("input", (e) => {
            const multiplier = parseFloat(e.target.value);
            planets[1].attraction =
                planets[1].originalAttraction * multiplier;
            document.getElementById("attractionValue1").textContent =
                multiplier;
        });

    document
        .getElementById("attractionSlider2")
        .addEventListener("input", (e) => {
            const multiplier = parseFloat(e.target.value);
            planets[2].attraction =
                planets[2].originalAttraction * multiplier;
            document.getElementById("attractionValue2").textContent =
                multiplier;
        });

    // Slider pour la 4ème planète (rouge)
    document
        .getElementById("attractionSlider3")
        .addEventListener("input", (e) => {
            const multiplier = parseFloat(e.target.value);
            planets[3].attraction =
                planets[3].originalAttraction * multiplier;
            document.getElementById("attractionValue3").textContent =
                multiplier;
        });

    // Cases à cocher pour chaque planète
    document
        .getElementById("togglePlanet0")
        .addEventListener("change", function (e) {
            togglePlanetVisibility(0, e.target.checked);
        });
    document
        .getElementById("togglePlanet1")
        .addEventListener("change", function (e) {
            togglePlanetVisibility(1, e.target.checked);
        });
    document
        .getElementById("togglePlanet2")
        .addEventListener("change", function (e) {
            togglePlanetVisibility(2, e.target.checked);
        });
    // Toggle pour la 4ème planète (rouge)
    document
        .getElementById("togglePlanet3")
        .addEventListener("change", function (e) {
            togglePlanetVisibility(3, e.target.checked);
        });

    let savedPositions = [];

    // Bouton pour sauvegarder les positions
    document.getElementById("saveBtn").addEventListener("click", () => {
        savedPositions = planets.map(planet => planet.mesh.position.clone());
        //alert("Positions sauvegardées");
    });

    // Bouton pour restaurer les positions
    document.getElementById("restoreBtn").addEventListener("click", () => {
        if (savedPositions.length === planets.length) {
            planets.forEach((planet, index) => {
                planet.mesh.position.copy(savedPositions[index]);
            });
            //alert("Positions restaurées");
        } else {
            alert("Aucune position sauvegardée");
        }
    });


    // Gestion du zoom avec la roulette de la souris
    renderer.domElement.addEventListener("wheel", function (event) {
        event.preventDefault(); // Empêche le défilement par défaut de la page
        const zoomSpeed = 0.01; // Ajustez la sensibilité du zoom ici
        // Décrémenter ou incrémenter le zoom en fonction de event.deltaY
        camera.zoom -= event.deltaY * zoomSpeed;
        // Limiter le zoom entre 0.1 et 5 (les mêmes valeurs que dans le slider)
        camera.zoom = Math.max(0.1, Math.min(camera.zoom, 5));
        camera.updateProjectionMatrix();
        // Mise à jour du slider et de son affichage
        document.getElementById("zoomSlider").value = camera.zoom;
        document.getElementById("zoomValue").textContent = camera.zoom.toFixed(1);
    }, { passive: false });
}

// Convertit la position de la souris (ou du toucher) en coordonnées sur le plan z=0
function getMousePositionOnPlane(event) {
    const pointer = getPointerEvent(event);
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((pointer.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((pointer.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const pos = new THREE.Vector3();
    raycaster.ray.intersectPlane(planeZ, pos);
    return pos;
}

// Crée une planète et enregistre ses paramètres de base
function createPlanet(position, radius, attraction, color) {
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshPhongMaterial({ color: color });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    scene.add(sphere);
    // On ajoute une propriété "active" pour savoir si la planète participe à la simulation
    planets.push({
        mesh: sphere,
        radius: radius,
        originalRadius: radius, // Sauvegarde du rayon de base
        attraction: attraction,
        originalAttraction: attraction,
        active: true
    });
}

// Création de l'objet à lancer (affiché sous forme de croix plus visible)
function createLaunchObject(position) {
    const group = new THREE.Group();
    // Utilisation de Mesh pour créer des barres épaisses
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    // Barre horizontale : largeur 20, hauteur 4, profondeur 2
    const horizontalGeometry = new THREE.BoxGeometry(20, 4, 2);
    const horizontalBar = new THREE.Mesh(horizontalGeometry, material);
    group.add(horizontalBar);
    // Barre verticale : largeur 4, hauteur 20, profondeur 2
    const verticalGeometry = new THREE.BoxGeometry(4, 20, 2);
    const verticalBar = new THREE.Mesh(verticalGeometry, material);
    group.add(verticalBar);
    group.position.copy(position);
    scene.add(group);
    return group;
}

// Au mousedown/touchstart, placement initial de l'objet et début du glisser
function onMouseDown(event) {
    // Contrôle du panoramique : MAJ+CLIC GAUCHE (desktop) ou 2 doigts (mobile)
    if ((event.shiftKey && event.button === 0) || (event.touches && event.touches.length === 2)) {
        isPanning = true;
        // Réinitialiser la distance de pinch
        previousPinchDistance = null;
        if (event.touches && event.touches.length === 2) {
            const touchMidX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
            const touchMidY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
            panStartWorld.copy(getWorldPositionFromClient(touchMidX, touchMidY));
        } else {
            panStartWorld.copy(getMousePositionOnPlane(event));
        }
        return;
    }

    event.preventDefault();
    const pos = getMousePositionOnPlane(event);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(
        planets.map((p) => p.mesh)
    );
    if (intersects.length > 0) {
        // Si on clique sur une planète, on ne fait rien ici (le drag de planète gère l'événement)
        return;
    }
    if (!launchObject && !isLaunched) {
        launchObject = createLaunchObject(pos);
        // Initialisation de la trajectoire avec la position de départ
        trajectoryPoints = [launchObject.position.clone()];
        trajectoryLine.geometry.setFromPoints(trajectoryPoints);
    }
    isDragging = true;
    dragLine.visible = true;
    updateDragLine(pos);
}

// Mise à jour de la ligne de visée pendant le glisser/toucher
function onMouseMove(event) {
    if (isPanning) {
        // Gestion du pinch-zoom et du panoramique pour 2 doigts
        if (event.touches && event.touches.length === 2) {
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];

            // Calcul du pinch (distance entre les deux doigts)
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            const currentPinchDistance = Math.sqrt(dx * dx + dy * dy);
            if (previousPinchDistance === null) {
                previousPinchDistance = currentPinchDistance;
            } else {
                const pinchRatio = currentPinchDistance / previousPinchDistance;
                camera.zoom *= pinchRatio;
                // Limiter le zoom entre 0.1 et 5
                camera.zoom = Math.max(0.1, Math.min(camera.zoom, 5));
                camera.updateProjectionMatrix();
                document.getElementById("zoomSlider").value = camera.zoom;
                document.getElementById("zoomValue").textContent = camera.zoom.toFixed(1);
                previousPinchDistance = currentPinchDistance;
            }

            // Calcul de la position médiane pour le panoramique
            const touchMidX = (touch1.clientX + touch2.clientX) / 2;
            const touchMidY = (touch1.clientY + touch2.clientY) / 2;
            const currentWorld = getWorldPositionFromClient(touchMidX, touchMidY);
            const offset = new THREE.Vector3().subVectors(panStartWorld, currentWorld);
            camera.position.add(offset);
            cameraTarget.add(offset);
            camera.lookAt(cameraTarget);
            panStartWorld.copy(currentWorld);
        } else {
            let currentWorld = getMousePositionOnPlane(event);
            const offset = new THREE.Vector3().subVectors(panStartWorld, currentWorld);
            camera.position.add(offset);
            cameraTarget.add(offset);
            camera.lookAt(cameraTarget);
            panStartWorld.copy(currentWorld);
        }
        return;
    }

    if (!isDragging) return;
    const pos = getMousePositionOnPlane(event);
    updateDragLine(pos);
}

// Met à jour la ligne entre l'objet lancé et la position actuelle du curseur/toucher
function updateDragLine(mousePos) {
    if (!launchObject) return;
    const points = [
        launchObject.position.clone(),
        mousePos.clone()
    ];
    dragLine.geometry.setFromPoints(points);
}

// Au mouseup/touchend, calcul du vecteur de lancement et démarrage de la simulation
function onMouseUp(event) {
    if (isPanning) {
        isPanning = false;
        previousPinchDistance = null;
        return;
    }

    if (!isDragging || !launchObject) return;
    isDragging = false;
    dragLine.visible = false;
    const pos = getMousePositionOnPlane(event);
    // Inversion du sens : on calcule le vecteur allant de l'objet vers la position cliquée/touchée
    const launchVector = new THREE.Vector3().subVectors(
        pos,
        launchObject.position
    );
    const forceFactor = 0.1;
    launchVelocity.copy(launchVector.multiplyScalar(forceFactor));
    isLaunched = true;
}

// Gestion du redimensionnement de la fenêtre
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onWindowResize, false);

// Réinitialise la simulation (objet lancé, trajectoire, explosion)
function resetSimulation() {
    if (launchObject) {
        scene.remove(launchObject);
        launchObject = null;
    }
    isLaunched = false;
    isDragging = false;
    if (explosion) {
        scene.remove(explosion);
        explosion = null;
    }
    launchVelocity.set(0, 0, 0);
    trajectoryPoints = [];
    trajectoryLine.geometry.setFromPoints(trajectoryPoints);
}

// Fonction pour configurer le système Terre-Lune avec des données « réelles »
function setupEarthMoonConfiguration() {
    // Supprime toutes les planètes existantes
    planets.forEach((planet) => {
        scene.remove(planet.mesh);
    });
    planets = [];

    // Masquer le conteneur de la 3e planète dans l'UI
    document.getElementById("planet2Container").style.display = "none";

    // Repositionner la caméra pour bien voir le système
    camera.position.set(0, 0, 500);
    cameraTarget.set(0, 0, 0);
    camera.lookAt(cameraTarget);

    // Créer la Terre (planète 0) – considérée fixe
    createPlanet(new THREE.Vector3(0, 0, 0), 30, 10000, 0x0000ff);

    // Créer la Lune (planète 1)
    createPlanet(new THREE.Vector3(200, 0, 0), 8, 123, 0x888888);

    // Réinitialise la simulation
    resetSimulation();
}

// Boucle d'animation principale
function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta() * simulationSpeed;

    if (launchObject && isLaunched && !explosion) {
        // Calcul de l'accélération par les planètes actives
        const acceleration = new THREE.Vector3();
        planets.forEach((planet) => {
            if (planet.active) {
                const diff = new THREE.Vector3().subVectors(
                    planet.mesh.position,
                    launchObject.position
                );
                const distanceSq = diff.lengthSq();
                if (distanceSq < 0.0001) return;
                acceleration.add(
                    diff.normalize().multiplyScalar(planet.attraction / distanceSq)
                );
            }
        });
        const aMagnitude = acceleration.length();
        const currentVelocity = launchVelocity.clone();
        let sign = "+";
        if (currentVelocity.length() > 0 && currentVelocity.dot(acceleration) < 0) {
            sign = "–";
        }
        launchVelocity.add(acceleration.multiplyScalar(dt));
        launchObject.position.add(launchVelocity.clone().multiplyScalar(dt));

        const accelerationDisplay = document.getElementById("accelerationDisplay");
        accelerationDisplay.textContent = "Acc.: " + sign + aMagnitude.toFixed(2) + " m/s²";
        if (sign === "–") {
            accelerationDisplay.style.color = "red";
        } else {
            accelerationDisplay.style.color = "royalblue";
        }

        trajectoryPoints.push(launchObject.position.clone());
        trajectoryLine.geometry.setFromPoints(trajectoryPoints);

        planets.forEach((planet) => {
            if (planet.active) {
                const dist = launchObject.position.distanceTo(planet.mesh.position);
                if (dist <= planet.radius) {
                    triggerExplosion(launchObject.position);
                    scene.remove(launchObject);
                    launchObject = null;
                    isLaunched = false;
                }
            }
        });
    }

    if (launchObject && isLaunched) {
        const speed = launchVelocity.length();
        document.getElementById("velocityDisplay").textContent = "Vit.: " + speed.toFixed(2) + " m/s";
    } else {
        document.getElementById("velocityDisplay").textContent = "Vit.: 0 m/s";
    }

    if (!(launchObject && isLaunched && !explosion)) {
        const accelerationDisplay = document.getElementById("accelerationDisplay");
        accelerationDisplay.textContent = "Acc.: 0 m/s²";
        accelerationDisplay.style.color = "royalblue";
    }

    if (explosion) {
        explosionTime += dt;
        const scale = 1 + explosionTime * 5;
        explosion.scale.set(scale, scale, scale);
        explosion.material.opacity = Math.max(1 - explosionTime, 0);
        explosion.material.needsUpdate = true;
        if (explosionTime > 1) {
            scene.remove(explosion);
            explosion = null;
            explosionTime = 0;
        }
    }
    // Assurez-vous que la croix reste de taille constante, quel que soit le zoom
    if (launchObject) {
        launchObject.scale.set(1 / camera.zoom, 1 / camera.zoom, 1 / camera.zoom);
    }
    renderer.render(scene, camera);
}

// Déclenche une explosion simple
function triggerExplosion(position) {
    const geometry = new THREE.SphereGeometry(10, 16, 16);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 1
    });
    explosion = new THREE.Mesh(geometry, material);
    explosion.position.copy(position);
    scene.add(explosion);
    explosionTime = 0;
    document.getElementById("explosionSound").play();
}

// Active ou désactive une planète donnée
function togglePlanetVisibility(index, visible) {
    const planet = planets[index];
    if (visible) {
        if (!planet.mesh.parent) {
            scene.add(planet.mesh);
        }
        planet.attraction = planet.originalAttraction;
        planet.active = true;
    } else {
        if (planet.mesh.parent) {
            scene.remove(planet.mesh);
        }
        planet.attraction = 0;
        planet.active = false;
    }
}