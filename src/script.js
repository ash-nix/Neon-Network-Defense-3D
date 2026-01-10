/** CONFIG & STATE **/
let energy = 300;
let storedEnergy = 300;
let health = 100;
let isConnectMode = false;
let isSandboxMode = false;
let showSandboxButton = true; // Set to true for development
let selectedNode = null;
let selectedType = null; // Changed to null for toggle logic
let frame = 0;
let hologram = null;
let selectionRing = null;
let towerRangeRing = null; // New range ring for built towers
let siloPrice = 1000;

let currentWave = 0;
let isWaveActive = false;
let enemiesToSpawn = 0;
let spawnTimer = 0;
let totalEnemiesThisWave = 0;

const TOWER_TYPES = {
    RIFLE: { cost: 50, color: 0x00f0ff, height: 1.5, range: 18, maxRange: 25, damage: 4, cooldown: 30, cap: 10, aoe: 0, projectileType: 'sphere' },
    CANNON: { cost: 100, color: 0x00ff88, height: 1.2, range: 12, maxRange: 18, damage: 18, cooldown: 80, cap: 8, aoe: 5, projectileType: 'cube' },
    ROCKET: { cost: 180, color: 0xffaa00, height: 1.4, range: 16, maxRange: 28, damage: 40, cooldown: 140, cap: 5, aoe: 4, projectileType: 'rocket' },
    SNIPER: { cost: 350, color: 0xff00ff, height: 2.5, range: 45, maxRange: 80, damage: 75, cooldown: 150, cap: 3, aoe: 0, projectileType: 'sphere' },
    SILO: { cost: 1000, color: 0xff3333, height: 1.0, range: 100, maxRange: 150, damage: 150, cooldown: 3600, cap: 1, aoe: 12, projectileType: 'missile' }
};

const core = {
    isCore: true,
    x: 0, z: 0,
    level: 1,
    storage: 0,
    capacity: 30,
    basePulseInterval: 15,
    pulseInterval: 15,
    upgradeCost: 150,
    distFromCore: 0,
    repairRate: 0.01 / 60,
    satellites: [],
    walls: [],
    availableCapacity: function () {
        const incoming = resourcePackets.filter(p => p.to === this).length;
        return this.capacity - (this.storage + incoming);
    }
};

/** THREE.JS SCENE **/
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x404040, 1.2);
scene.add(ambientLight);
const pointLight = new THREE.PointLight(0x00f0ff, 1.5, 100);
pointLight.position.set(0, 20, 0);
scene.add(pointLight);

const towers = [];
const enemies = [];
const projectiles = [];
const connections = [];
const resourcePackets = [];
const shards = [];
const gatherers = [];
const obstacles = [];
const obstacleMeshes = [];

function createGround() {
    const size = 150;
    const res = 64;
    const geo = new THREE.PlaneGeometry(size, size, res, res);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        const dist = Math.sqrt(px * px + py * py);
        let height = (Math.sin(px * 0.1) * Math.cos(py * 0.1)) * 0.3;
        if (dist < 10) height = -0.2;
        pos.setZ(i, height);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhongMaterial({ color: 0x1a1a2e, emissive: 0x050510, flatShading: true });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);
    addStarfield();
    addEnvironmentDecor();

    // JUMPING SELECTION RING
    const ringGeo = new THREE.RingGeometry(2.1, 2.3, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    selectionRing = new THREE.Mesh(ringGeo, ringMat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.5;
    selectionRing.visible = false;
    scene.add(selectionRing);

    // PERSISTENT TOWER RANGE RING (Invisible by default)
    const rangeGeo = new THREE.RingGeometry(17.9, 18.1, 64);
    const rangeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    towerRangeRing = new THREE.Mesh(rangeGeo, rangeMat);
    towerRangeRing.rotation.x = -Math.PI / 2;
    towerRangeRing.position.y = 0.1;
    towerRangeRing.visible = false;
    scene.add(towerRangeRing);
}

function addEnvironmentDecor() {
    const decorCount = 60;
    const rockMat = new THREE.MeshPhongMaterial({ color: 0x444466, emissive: 0x111122, flatShading: true });
    const leafMat = new THREE.MeshPhongMaterial({ color: 0x00ff88, emissive: 0x002211, flatShading: true });
    const trunkMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });

    for (let i = 0; i < decorCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 18 + Math.random() * 50;
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;

        let tooClose = false;
        for (const obs of obstacles) {
            if (Math.hypot(x - obs.x, z - obs.z) < 6.0) { tooClose = true; break; }
        }
        if (tooClose) continue;

        if (Math.random() > 0.4) {
            const treeGroup = new THREE.Group();
            const scale = 0.8 + Math.random() * 1.2;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 6), trunkMat);
            trunk.position.y = 0.5; treeGroup.add(trunk);
            const layers = 3;
            for (let j = 0; j < layers; j++) {
                const layer = new THREE.Mesh(new THREE.ConeGeometry(0.9 - j * 0.25, 1.4, 6), leafMat);
                layer.position.y = 1 + j * 0.8; treeGroup.add(layer);
                obstacleMeshes.push(layer);
            }
            treeGroup.position.set(x, -0.2, z);
            treeGroup.scale.set(scale, scale, scale);
            scene.add(treeGroup);
            obstacles.push({ x, z, radius: 1.0 * scale, mesh: treeGroup });
        } else {
            const rockScale = 0.6 + Math.random() * 1.4;
            const rockGeo = new THREE.DodecahedronGeometry(rockScale, 0);
            const rock = new THREE.Mesh(rockGeo, rockMat);
            rock.position.set(x, rockScale * 0.5 - 0.2, z);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            scene.add(rock);
            obstacleMeshes.push(rock);
            obstacles.push({ x, z, radius: rockScale * 0.8, mesh: rock });
        }
    }
}

function addStarfield() {
    // Create stars
    const starCount = 500;
    const starGeometry = new THREE.SphereGeometry(0.03, 6, 6);
    const starMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });

    for (let i = 0; i < starCount; i++) {
        const star = new THREE.Mesh(starGeometry, starMaterial);

        // Random position in a large sphere around the scene
        const radius = 120 + Math.random() * 180;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;

        star.position.x = radius * Math.sin(phi) * Math.cos(theta);
        star.position.y = radius * Math.cos(phi) + 30; // Offset upward
        star.position.z = radius * Math.sin(phi) * Math.sin(theta);

        // Much brighter stars
        star.material.opacity = 0.8 + Math.random() * 0.2;

        scene.add(star);
    }

    // Create Milky Way band
    const milkyWayStarCount = 400;
    const milkyWayGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const milkyWayMaterial = new THREE.MeshBasicMaterial({ color: 0xe6e6fa, transparent: true });

    for (let i = 0; i < milkyWayStarCount; i++) {
        const star = new THREE.Mesh(milkyWayGeometry, milkyWayMaterial);

        // Create a horizontal galactic band - visible on the side when camera rotates
        const bandRadius = 180 + Math.random() * 120;
        const bandHeight = (Math.random() - 0.5) * 60; // Wider vertical spread
        const theta = Math.random() * Math.PI * 2;

        // Position the band more horizontally, offset to the side
        star.position.x = bandRadius * Math.cos(theta) + 50; // Offset to the right side
        star.position.y = bandHeight + 25; // Lower vertical position
        star.position.z = bandRadius * Math.sin(theta) - 30; // Offset backward

        // Color variation for milky way stars
        const colors = [0xffffff, 0xe6e6fa, 0xf0f8ff, 0xadd8e6, 0xb0c4de];
        star.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
        star.material.opacity = 0.8 + Math.random() * 0.2;

        scene.add(star);
    }

    // Create Milky Way dust clouds
    const dustCount = 200;
    const dustGeometry = new THREE.SphereGeometry(0.02, 4, 4);
    const dustMaterial = new THREE.MeshBasicMaterial({ color: 0x9370db, transparent: true });

    for (let i = 0; i < dustCount; i++) {
        const dust = new THREE.Mesh(dustGeometry, dustMaterial);

        // Position dust within the Milky Way band
        const bandRadius = 160 + Math.random() * 140;
        const bandHeight = (Math.random() - 0.5) * 80;
        const theta = Math.random() * Math.PI * 2;

        dust.position.x = bandRadius * Math.cos(theta) + 50;
        dust.position.y = bandHeight + 25;
        dust.position.z = bandRadius * Math.sin(theta) - 30;

        // Very faint dust particles
        dust.material.opacity = 0.1 + Math.random() * 0.2;

        // Color variation for dust
        const dustColors = [0x9370db, 0x8a2be2, 0x4b0082, 0x6a5acd];
        dust.material.color.setHex(dustColors[Math.floor(Math.random() * dustColors.length)]);

        scene.add(dust);
    }

    // Create moon
    const moonGeometry = new THREE.SphereGeometry(3, 32, 32);
    const moonMaterial = new THREE.MeshPhongMaterial({
        color: 0xf5f5dc,
        emissive: 0x444444,
        transparent: true,
        opacity: 0.9
    });
    const moon = new THREE.Mesh(moonGeometry, moonMaterial);

    // Position moon in the sky
    moon.position.set(80, 60, -40);

    // Add subtle glow effect
    const moonGlowGeometry = new THREE.SphereGeometry(3.5, 32, 32);
    const moonGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xf5f5dc,
        transparent: true,
        opacity: 0.1,
        side: THREE.BackSide
    });
    const moonGlow = new THREE.Mesh(moonGlowGeometry, moonGlowMaterial);
    moon.add(moonGlow);

    scene.add(moon);
}

createGround();

const coreGroup = new THREE.Group();
scene.add(coreGroup);
const coreGeo = new THREE.IcosahedronGeometry(2, 2);
const coreMat = new THREE.MeshPhongMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.8, wireframe: true });
const coreMesh = new THREE.Mesh(coreGeo, coreMat);
coreMesh.position.y = 2.5;
coreGroup.add(coreMesh);
core.mesh = coreMesh;

const coreCapBar = createUIBar(0x00f0ff);
coreMesh.add(coreCapBar);
coreCapBar.position.y = 2.5;
core.capBar = coreCapBar;

function updateCoreArchitecture() {
    const lvl = core.level;
    const satMat = new THREE.MeshPhongMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, wireframe: true });
    const wallMat = new THREE.MeshPhongMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const satCoords = [{ x: 5, z: 0 }, { x: -5, z: 0 }, { x: 0, z: 5 }, { x: 0, z: -5 }];

    for (let i = 0; i < 4; i++) {
        if (lvl >= i + 2 && !core.satellites[i]) {
            const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), satMat);
            s.position.set(satCoords[i].x, 2.5, satCoords[i].z);
            coreGroup.add(s);
            core.satellites[i] = s;
            const beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 5);
            const beam = new THREE.Mesh(beamGeo, wallMat);
            beam.position.set(satCoords[i].x / 2, 2.5, satCoords[i].z / 2);
            beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.position.clone().sub(new THREE.Vector3(0, 2.5, 0)).normalize());
            coreGroup.add(beam);
        }
    }
    const wallPairs = [[0, 2], [2, 1], [1, 3], [3, 0]];
    for (let i = 0; i < 4; i++) {
        if (lvl >= i + 6 && !core.walls[i]) {
            const p1 = core.satellites[wallPairs[i][0]].position;
            const p2 = core.satellites[wallPairs[i][1]].position;
            const dist = p1.distanceTo(p2);
            const wall = new THREE.Mesh(new THREE.PlaneGeometry(dist, 1.5), wallMat);
            wall.position.copy(p1).add(p2).multiplyScalar(0.5);
            wall.lookAt(p2);
            wall.rotateY(Math.PI / 2);
            coreGroup.add(wall);
            core.walls[i] = wall;
        }
    }
}

/** CAMERA CONTROLS **/
let camDist = 70, camRotX = 0.8, camRotY = 0.5;
let isDragging = false, lastMouse = { x: 0, y: 0 };
function updateCamera() {
    camera.position.x = camDist * Math.sin(camRotY) * Math.cos(camRotX);
    camera.position.z = camDist * Math.cos(camRotY) * Math.cos(camRotX);
    camera.position.y = camDist * Math.sin(camRotX);
    camera.lookAt(0, 0, 0);
}
updateCamera();

/** LOGIC HELPERS **/
function showMsg(txt) {
    const m = document.getElementById('msg');
    m.innerText = txt;
    m.style.display = 'block';
    setTimeout(() => m.style.display = 'none', 3000);
}

function createUIBar(color) {
    const group = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.2), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.2), new THREE.MeshBasicMaterial({ color: color }));
    fg.position.z = 0.01;
    group.add(bg);
    group.add(fg);
    group.fg = fg;
    return group;
}

function createCooldownClock() {
    const group = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 }));
    const clockMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const clock = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.7, 32, 1, Math.PI / 2, Math.PI * 2), clockMat);
    clock.position.z = 0.01;
    group.add(bg);
    group.add(clock);
    group.clock = clock;
    return group;
}

function formatNumber(num) { return Math.round(num * 10) / 10; }

function renderUpgradeStats() {
    const container = document.getElementById('up-stats-container');
    container.innerHTML = '';
    if (!selectedNode) return;

    const createRow = (name, current, boost) => {
        const row = document.createElement('div');
        row.className = 'stat-diff-row';
        row.innerHTML = `<span class="stat-name">${name}</span><span>${current} <span class="stat-boost">${boost}</span></span>`;
        container.appendChild(row);
    };

    if (selectedNode.isCore) {
        const genSpeed = formatNumber(60 / core.pulseInterval);
        const nextLvl = core.level + 1;
        const nextInterval = core.basePulseInterval / (1 + (nextLvl - 1) * 0.1);
        const nextGenSpeed = formatNumber(60 / nextInterval);
        const boost = formatNumber(nextGenSpeed - genSpeed);

        createRow("Energy Generation", genSpeed + "/s", "+" + boost);
        createRow("Internal Capacity", core.capacity, "+25");
        createRow("Repair Integrity", formatNumber(core.repairRate * 60 * 100) + "%/s", "+0.1%/s");
    } else {
        const cfg = TOWER_TYPES[selectedNode.type];
        const nextDmg = selectedNode.damage * 0.25;
        const nextRangeVal = selectedNode.range * 1.1;
        const cooldownSpeed = formatNumber(60 / selectedNode.maxCooldown);
        const nextCooldown = selectedNode.maxCooldown * 0.9;
        const nextSpeed = formatNumber(60 / nextCooldown);

        createRow("Attack Power", formatNumber(selectedNode.damage), "+" + formatNumber(nextDmg));

        let rangeBoostText = "+" + formatNumber(nextRangeVal - selectedNode.range);
        if (selectedNode.range >= cfg.maxRange) rangeBoostText = "(MAX)";
        createRow("Targeting Range", formatNumber(selectedNode.range), rangeBoostText);

        createRow("Firing Speed", cooldownSpeed + "/s", "+" + formatNumber(nextSpeed - cooldownSpeed));
    }
}

function updateUI() {
    // Show/hide sandbox button based on development flag
    const sandboxBtn = document.getElementById('sandbox-btn');
    const sandboxInfoTxt = document.getElementById('sandbox-info');
    const sandboxDivider = document.getElementById('sandbox-divider');
    if (showSandboxButton) {
        sandboxBtn.style.display = 'block';
        sandboxDivider.style.display = 'block';
        sandboxInfoTxt.style.display = 'block';
    } else {
        sandboxBtn.style.display = 'none';
        sandboxDivider.style.display = 'none';
        sandboxInfoTxt.style.display = 'none';
    }

    if (isSandboxMode) energy = 99999;

    document.getElementById('energy-display').innerText = isSandboxMode ? "∞" : Math.floor(energy);
    document.getElementById('health-display').innerText = Math.max(0, Math.floor(health)) + "%";
    document.getElementById('wave-display').innerText = isWaveActive ? `Wave ${currentWave}` : "Ready";
    document.getElementById('cost-SILO').innerText = siloPrice;

    const enemyStatBox = document.getElementById('enemy-stat-box');
    if (isWaveActive) {
        enemyStatBox.style.display = 'block';
        document.getElementById('enemy-count-display').innerText = enemiesToSpawn + enemies.length;
    } else {
        enemyStatBox.style.display = 'none';
    }
    if (health <= 0) document.getElementById('game-over').style.display = 'flex';

    const upBtn = document.getElementById('up-confirm');
    const waveBtn = document.getElementById('start-wave-btn');
    waveBtn.disabled = isWaveActive;

    if (selectedNode) {
        const cost = selectedNode.isCore ? core.upgradeCost : selectedNode.upgradeCost;
        upBtn.disabled = !isSandboxMode && energy < cost;
        upBtn.innerText = isSandboxMode ? `UPGRADE (FREE)` : `UPGRADE (${cost})`;
        document.getElementById('up-title').innerText = selectedNode.isCore ? "CORE ARCHITECTURE" : selectedNode.type + " NODE";
        document.getElementById('up-lvl').innerText = "System Integrity: Level " + selectedNode.level;
        document.getElementById('sell-btn').style.display = selectedNode.isCore ? 'none' : 'block';
        renderUpgradeStats();
    }
}

function toggleSandboxMode() {
    isSandboxMode = !isSandboxMode;
    const btn = document.getElementById('sandbox-btn');
    if (isSandboxMode) {
        storedEnergy = energy;
        energy = 99999;
        btn.classList.add('active');
        btn.innerText = "SANDBOX\nON";
        showMsg("SANDBOX MODE: INFINITE ENERGY");
    } else {
        energy = storedEnergy;
        btn.classList.remove('active');
        btn.innerText = "SANDBOX\nOFF";
    }
    updateUI();
}

function toggleHelp() {
    const panel = document.getElementById('help-panel');
    const isVisible = panel.style.display === 'flex';
    if (isVisible) {
        panel.style.display = 'none';
    } else {
        panel.style.display = 'flex';
        hideUpgrade(); // Close upgrade panel if open
    }
}

function selectTower(type) {
    // Toggle logic
    if (selectedType === type) {
        selectedType = null;
        document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('active'));
        if (hologram) removeHologram();
        showMsg("BUILD MODE: OFF");
    } else {
        selectedType = type;
        document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('btn-' + type).classList.add('active');
        if (isConnectMode) toggleConnectMode();
        if (hologram) removeHologram();
        clearSelection(); // Deselect existing nodes when entering build mode
        showMsg("BUILD MODE: " + type);
    }
}

function toggleConnectMode() {
    isConnectMode = !isConnectMode;
    const btn = document.getElementById('connect-btn');
    const indicator = document.getElementById('connect-indicator');
    if (isConnectMode) {
        btn.classList.add('active');
        btn.innerText = "CONNECT\nON";
        indicator.style.display = "block";
        // Exit build mode
        selectedType = null;
        document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('active'));
    } else {
        btn.classList.remove('active');
        btn.innerText = "CONNECT\nOFF";
        indicator.style.display = "none";
        clearSelection();
    }
    if (hologram) removeHologram();
}

function clearSelection() {
    if (selectedNode && selectedNode.mesh) {
        selectedNode.mesh.traverse(child => {
            if (child.material && child.material.emissiveIntensity !== undefined) child.material.emissiveIntensity = 0.5;
        });
    }
    selectedNode = null;
    selectionRing.visible = false;
    towerRangeRing.visible = false;
    hideUpgrade();
}

function hideUpgrade() { document.getElementById('upgrade-panel').style.display = 'none'; }
function hideHelp() { document.getElementById('help-panel').style.display = 'none'; }
function showUpgrade() { if (!selectedNode) return; hideHelp(); document.getElementById('upgrade-panel').style.display = 'flex'; updateUI(); }

function sellSelected() {
    if (!selectedNode || selectedNode.isCore) return;
    const refund = Math.floor(TOWER_TYPES[selectedNode.type].cost * 0.5);
    if (!isSandboxMode) energy += refund;
    for (let i = connections.length - 1; i >= 0; i--) {
        const c = connections[i];
        if (c.a === selectedNode || c.b === selectedNode) { scene.remove(c.mesh); connections.splice(i, 1); }
    }
    for (let i = resourcePackets.length - 1; i >= 0; i--) {
        if (resourcePackets[i].to === selectedNode || resourcePackets[i].from === selectedNode) {
            scene.remove(resourcePackets[i].mesh); resourcePackets.splice(i, 1);
        }
    }
    scene.remove(selectedNode.mesh);
    towers.splice(towers.indexOf(selectedNode), 1);
    updateNetworkDistances();
    clearSelection();
    updateUI();
}

function startWave() {
    if (isWaveActive) return;
    currentWave++;
    isWaveActive = true;
    let baseCount = 8;
    let effectiveMultiplier = 1.15;
    totalEnemiesThisWave = Math.ceil(baseCount * Math.pow(effectiveMultiplier, currentWave - 1));
    enemiesToSpawn = totalEnemiesThisWave;
    spawnTimer = 0;
    showMsg(`THREAT DETECTED: WAVE ${currentWave}`);
    updateUI();
}

function updateNetworkDistances() {
    towers.forEach(t => t.distFromCore = Infinity);
    core.distFromCore = 0;
    let queue = [core];
    while (queue.length > 0) {
        let current = queue.shift();
        connections.forEach(conn => {
            let neighbor = null;
            if (conn.a === current) neighbor = conn.b;
            else if (conn.b === current) neighbor = conn.a;
            if (neighbor && neighbor.distFromCore === Infinity) {
                neighbor.distFromCore = current.distFromCore + 1;
                queue.push(neighbor);
            }
        });
    }
}

function checkPlacementCollision(x, z) {
    if (Math.hypot(x, z) < 10) return "TOO CLOSE TO CORE";
    for (const obs of obstacles) {
        const dist = Math.hypot(x - obs.x, z - obs.z);
        if (dist < obs.radius + 1.2) return "OBSTRUCTION DETECTED";
    }
    for (const t of towers) {
        const dist = Math.hypot(x - t.x, z - t.z);
        if (dist < 2.5) return "SPACE OCCUPIED";
    }
    return null;
}

const lineOfSightRaycaster = new THREE.Raycaster();
function isPathBlockedByObstacle(nodeA, nodeB) {
    const start = new THREE.Vector3(nodeA.x, 0.8, nodeA.z);
    const end = new THREE.Vector3(nodeB.x, 0.8, nodeB.z);
    const direction = end.clone().sub(start).normalize();
    const distance = start.distanceTo(end);
    lineOfSightRaycaster.set(start, direction);
    lineOfSightRaycaster.far = distance;
    const hits = lineOfSightRaycaster.intersectObjects(obstacleMeshes);
    return hits.length > 0;
}

function createHologram(x, z, type) {
    if (hologram) removeHologram();
    const cfg = TOWER_TYPES[type];
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const collisionErr = checkPlacementCollision(x, z);
    const holoColor = collisionErr ? 0xff0000 : cfg.color;
    const holoMat = new THREE.MeshPhongMaterial({ color: holoColor, transparent: true, opacity: 0.4, wireframe: true });

    if (type === 'SILO') {
        const base = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 3), holoMat);
        base.position.y = 0.2; group.add(base);
    } else {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 0.4, 6), holoMat);
        base.position.y = 0.2; group.add(base);
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.3, cfg.height, 0.3), holoMat);
        stand.position.y = cfg.height / 2 + 0.4; group.add(stand);
    }

    const ringGeo = new THREE.RingGeometry(cfg.range - 0.1, cfg.range + 0.1, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: holoColor, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; group.add(ring);
    scene.add(group);
    hologram = { mesh: group, type, x, z, error: collisionErr };
    if (collisionErr) showMsg(collisionErr);
}
function removeHologram() { if (hologram) { scene.remove(hologram.mesh); hologram = null; } }

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
window.addEventListener('mousedown', (e) => {
    if (e.target.closest('#toolbar') || e.target.closest('#upgrade-panel') || e.target.closest('#help-panel')) return;
    isDragging = true; lastMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        camRotY -= (e.clientX - lastMouse.x) * 0.005;
        camRotX += (e.clientY - lastMouse.y) * 0.005;
        camRotX = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, camRotX));
        updateCamera();
        lastMouse = { x: e.clientX, y: e.clientY };
    }
});
window.addEventListener('mouseup', (e) => {
    const moveDist = Math.hypot(e.clientX - lastMouse.x, e.clientY - lastMouse.y);
    isDragging = false;
    if (moveDist > 5) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const nodeMeshes = [coreMesh];
    towers.forEach(t => { t.mesh.traverse(child => { if (child.isMesh) nodeMeshes.push(child); }); });
    if (hologram) { hologram.mesh.traverse(child => { if (child.isMesh) nodeMeshes.push(child); }); }

    const intersects = raycaster.intersectObjects(nodeMeshes);
    if (intersects.length > 0) {
        const hitObject = intersects[0].object;
        let hitHologram = false;
        if (hologram) hologram.mesh.traverse(child => { if (child === hitObject) hitHologram = true; });

        if (hitHologram) {
            if (hologram.error) { showMsg(hologram.error); return; }
            const cost = hologram.type === 'SILO' ? siloPrice : TOWER_TYPES[hologram.type].cost;
            if (isSandboxMode || energy >= cost) {
                if (!isSandboxMode) energy -= cost;
                if (hologram.type === 'SILO') {
                    siloPrice = Math.floor(siloPrice * 1.5);
                }
                createTower(hologram.x, hologram.z, hologram.type);
                removeHologram();
                updateUI();
            }
            else { showMsg("INSUFFICIENT ENERGY"); }
            return;
        }

        let hitNode = hitObject === coreMesh ? core : towers.find(t => {
            let found = false;
            t.mesh.traverse(child => { if (child === hitObject) found = true; });
            return found;
        });

        if (hitNode) {
            if (isConnectMode) {
                if (selectedNode && selectedNode !== hitNode) {
                    const existing = connections.find(c => (c.a === selectedNode && c.b === hitNode) || (c.b === selectedNode && c.a === hitNode));
                    if (existing) { showMsg("CONNECTION ALREADY EXISTS"); clearSelection(); }
                    else if (isPathBlockedByObstacle(selectedNode, hitNode)) { showMsg("OBSTACLE BLOCKS SIGNAL PATH!"); }
                    else {
                        const lineMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.6 });
                        const lineGeo = new THREE.BufferGeometry().setFromPoints([
                            new THREE.Vector3(selectedNode.x, 0.5, selectedNode.z),
                            new THREE.Vector3(hitNode.x, 0.5, hitNode.z)
                        ]);
                        const line = new THREE.Line(lineGeo, lineMat);
                        scene.add(line);
                        connections.push({ a: selectedNode, b: hitNode, mesh: line });
                        updateNetworkDistances();
                        clearSelection();
                    }
                } else {
                    clearSelection();
                    selectedNode = hitNode;
                    hitNode.mesh.traverse(child => { if (child.material) child.material.emissiveIntensity = 4.0; });
                    selectionRing.position.set(hitNode.x, 0.5, hitNode.z);
                    selectionRing.visible = true;

                    // Show range ring for building
                    if (!hitNode.isCore) {
                        towerRangeRing.geometry.dispose();
                        towerRangeRing.geometry = new THREE.RingGeometry(hitNode.range - 0.1, hitNode.range + 0.1, 64);
                        towerRangeRing.material.color.setHex(TOWER_TYPES[hitNode.type].color);
                        towerRangeRing.position.set(hitNode.x, 0.1, hitNode.z);
                        towerRangeRing.visible = true;
                    }
                }
            } else {
                clearSelection();
                selectedNode = hitNode;
                hitNode.mesh.traverse(child => { if (child.material) child.material.emissiveIntensity = 2.0; });
                selectionRing.position.set(hitNode.x, 0.5, hitNode.z);
                selectionRing.visible = true;

                // Show range ring for building
                if (!hitNode.isCore) {
                    towerRangeRing.geometry.dispose();
                    towerRangeRing.geometry = new THREE.RingGeometry(hitNode.range - 0.1, hitNode.range + 0.1, 64);
                    towerRangeRing.material.color.setHex(TOWER_TYPES[hitNode.type].color);
                    towerRangeRing.position.set(hitNode.x, 0.1, hitNode.z);
                    towerRangeRing.visible = true;
                }

                showUpgrade();
                removeHologram();
            }
            return;
        }
    }

    // If nothing was hit, and we have a tower type selected, try to place hologram
    if (selectedType) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
            createHologram(intersectPoint.x, intersectPoint.z, selectedType);
        }
    } else {
        // Deselect everything if clicking empty space and no build mode active
        clearSelection();
    }
});

window.addEventListener('wheel', (e) => {
    // Prevent zooming when help panel is open
    if (document.getElementById('help-panel').style.display === 'flex') return;
    camDist = Math.max(15, Math.min(100, camDist + e.deltaY * 0.05));
    updateCamera();
});

function createTower(x, z, type) {
    const cfg = TOWER_TYPES[type];
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const standMat = new THREE.MeshPhongMaterial({ color: 0x222222, specular: 0x00f0ff, shininess: 50 });

    let towerData = {
        mesh: group, type, x, z, level: 1,
        range: cfg.range, damage: cfg.damage, maxCooldown: cfg.cooldown, cooldown: 0,
        storage: 0, capacity: cfg.cap, aoe: cfg.aoe, projectileType: cfg.projectileType,
        upgradeCost: Math.floor(cfg.cost * 1.5), distFromCore: Infinity,
        shotQueue: [],
        availableCapacity: function () {
            const incoming = resourcePackets.filter(p => p.to === this).length;
            return this.capacity - (this.storage + incoming);
        }
    };

    if (type === 'SILO') {
        const bunker = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 3), standMat);
        bunker.position.y = 0.3; group.add(bunker);
        const doorL = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 3), standMat);
        doorL.position.set(-0.75, 0.7, 0); group.add(doorL);
        const doorR = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 3), standMat);
        doorR.position.set(0.75, 0.7, 0); group.add(doorR);
        const launcher = new THREE.Group();
        for (let i = 0; i < 6; i++) {
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8), new THREE.MeshPhongMaterial({ color: 0x333333 }));
            tube.position.set((i % 2 - 0.5) * 0.8, 0, (Math.floor(i / 2) - 1) * 0.8);
            launcher.add(tube);
        }
        launcher.position.y = 0.3; group.add(launcher);
        towerData.doors = { L: doorL, R: doorR };
        towerData.launcher = launcher;
        towerData.state = 'WAITING';
        towerData.stateTimer = 0;

        const clockUI = createCooldownClock();
        clockUI.position.y = 4.5;
        clockUI.visible = false;
        group.add(clockUI);
        towerData.clockUI = clockUI;
    } else {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 0.4, 6), standMat);
        base.position.y = 0.2; group.add(base);
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.3, cfg.height, 0.3), standMat);
        stand.position.y = cfg.height / 2 + 0.4; group.add(stand);
        const headGroup = new THREE.Group();
        headGroup.position.y = cfg.height + 0.4;
        const barrels = new THREE.Group(); headGroup.add(barrels);
        towerData.head = headGroup;
        towerData.barrels = barrels;
        updateTowerBarrels(towerData);
        group.add(headGroup);
    }

    scene.add(group);
    const capBar = createUIBar(cfg.color);
    capBar.position.y = cfg.height + 1.8;
    group.add(capBar);
    towerData.capBar = capBar;
    towers.push(towerData);
    updateNetworkDistances();
}

function updateTowerBarrels(t) {
    if (t.type === 'SILO') return;
    const cfg = TOWER_TYPES[t.type];
    const weaponMat = new THREE.MeshPhongMaterial({ color: cfg.color, emissive: cfg.color, emissiveIntensity: 0.5 });
    while (t.barrels.children.length > 0) t.barrels.remove(t.barrels.children[0]);
    if (t.type === 'RIFLE') {
        t.barrels.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 1), weaponMat));
        let numBarrels = t.level === 1 ? 1 : (t.level === 2 ? 2 : 3);
        if (t.level >= 10) {
            const gatling = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 12), weaponMat);
            gatling.rotation.x = Math.PI / 2; gatling.position.z = 0.8; t.barrels.add(gatling);
        } else {
            for (let i = 0; i < numBarrels; i++) {
                const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 8), weaponMat);
                b.rotation.x = Math.PI / 2;
                let xOff = numBarrels === 2 ? (i === 0 ? -0.15 : 0.15) : (numBarrels === 3 ? (i - 1) * 0.2 : 0);
                b.position.set(xOff, 0, 0.6); t.barrels.add(b);
            }
        }
    } else if (t.type === 'CANNON') {
        t.barrels.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), weaponMat));
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.5, 12), weaponMat);
        barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.7; t.barrels.add(barrel);
    } else if (t.type === 'ROCKET') {
        t.barrels.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1.2), weaponMat));
        t.tubePositions = [];
        for (let ix = -1; ix <= 1; ix += 2) {
            for (let iy = -1; iy <= 1; iy += 2) {
                const localPos = new THREE.Vector3(ix * 0.25, iy * 0.2, 0.61); t.tubePositions.push(localPos);
                const circle = new THREE.Mesh(new THREE.CircleGeometry(0.15, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
                circle.position.copy(localPos); t.barrels.add(circle);
            }
        }
    } else if (t.type === 'SNIPER') {
        t.barrels.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1.2), weaponMat));
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.5, 8), weaponMat);
        barrel.rotation.x = Math.PI / 2; barrel.position.z = 1.8; t.barrels.add(barrel);
    }
}

function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * 80;
    const z = Math.sin(angle) * 80;
    const baseHealth = 10;
    const growthRate = 1.15;
    const maxHP = Math.floor(baseHealth * Math.pow(growthRate, currentWave - 1)) + (currentWave * 5);

    const vehicle = new THREE.Group();
    const metalMat = new THREE.MeshPhongMaterial({ color: 0x333333, specular: 0xff3333 });
    const roofMat = new THREE.MeshPhongMaterial({ color: 0x222222, emissive: 0x440000 });
    const wheelMat = new THREE.MeshPhongMaterial({ color: 0x111111 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 2.2), metalMat);
    chassis.position.y = 0.4; vehicle.add(chassis);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.2), roofMat);
    cabin.position.set(0, 0.85, -0.2); vehicle.add(cabin);

    const wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.25, 12);
    const wheelPositions = [{ x: 0.65, y: 0.3, z: 0.7 }, { x: -0.65, y: 0.3, z: 0.7 }, { x: 0.65, y: 0.3, z: -0.7 }, { x: -0.65, y: 0.3, z: -0.7 }];
    wheelPositions.forEach(p => {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2; w.position.set(p.x, p.y, p.z);
        vehicle.add(w); wheels.push(w);
    });

    const lightGeo = new THREE.CircleGeometry(0.15, 8);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    [0.4, -0.4].forEach(offX => {
        const l = new THREE.Mesh(lightGeo, lightMat);
        l.position.set(offX, 0.4, 1.11); vehicle.add(l);
    });

    vehicle.position.set(x, 0, z);
    scene.add(vehicle);
    const hpBar = createUIBar(0xff3333);
    hpBar.position.y = 2.0; vehicle.add(hpBar);

    enemies.push({ mesh: vehicle, wheels, health: maxHP, maxHP, hpBar, dead: false, velocity: new THREE.Vector3(0, 0, 0) });
}

function createGatherer() {
    if (gatherers.length >= 6) return;
    const group = new THREE.Group();
    const mat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), mat));
    const props = [];
    [[0.42, 0.1, 0.42], [-0.42, 0.1, 0.42], [0.42, 0.1, -0.42], [-0.42, 0.1, -0.42]].forEach(p => {
        const pr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
        pr.position.set(...p); group.add(pr); props.push(pr);
    });
    scene.add(group);
    gatherers.push({ mesh: group, props, storage: 0, capacity: 50, target: null, returning: false });
}
createGatherer();

function dispatchEnergy(source, val, peerOnly) {
    if (source.storage < val) return;
    const neighbors = connections.filter(c => c.a === source || c.b === source).map(c => c.a === source ? c.b : c.a);
    const targets = neighbors.filter(n => {
        if (peerOnly && n.isCore) return false;
        return n.distFromCore > source.distFromCore && n.availableCapacity() >= val;
    });
    if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        const pMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        scene.add(pMesh);
        resourcePackets.push({ mesh: pMesh, from: source, to: target, val, progress: 0 });
        source.storage -= val;
    }
}

function animate() {
    requestAnimationFrame(animate);
    frame++;
    const quat = camera.quaternion;

    // JUMPING SELECTION RING ANIMATION
    if (selectionRing.visible) {
        selectionRing.position.y = 0.5 + Math.sin(frame * 0.15) * 0.25;
        selectionRing.material.opacity = 0.5 + Math.sin(frame * 0.15) * 0.3;
    }

    // RANGE RING PULSE
    if (towerRangeRing.visible) {
        towerRangeRing.material.opacity = 0.2 + Math.sin(frame * 0.05) * 0.1;
    }

    core.capBar.quaternion.copy(quat);
    core.capBar.fg.scale.x = core.storage / core.capacity;
    core.capBar.fg.position.x = -1 + (core.storage / core.capacity);

    if (frame % Math.max(1, Math.round(core.pulseInterval)) === 0 && core.storage < core.capacity) core.storage++;
    if (core.storage >= 1 && frame % 10 === 0) dispatchEnergy(core, 1, false);
    if (health < 100) health = Math.min(100, health + core.repairRate);

    for (let i = resourcePackets.length - 1; i >= 0; i--) {
        const p = resourcePackets[i];
        p.progress += 0.025;
        p.mesh.position.lerpVectors(new THREE.Vector3(p.from.x, 1, p.from.z), new THREE.Vector3(p.to.x, 1, p.to.z), p.progress);
        if (p.progress >= 1) { p.to.storage = Math.min(p.to.capacity, p.to.storage + p.val); scene.remove(p.mesh); resourcePackets.splice(i, 1); }
    }

    towers.forEach(t => {
        t.capBar.quaternion.copy(quat);
        t.capBar.fg.scale.x = t.storage / t.capacity;
        t.capBar.fg.position.x = -1 + (t.storage / t.capacity);

        if (t.type === 'SILO') {
            t.clockUI.quaternion.copy(quat);

            if (t.state === 'WAITING') {
                if (t.cooldown > 0) {
                    t.cooldown--;
                    t.clockUI.visible = true;

                    const progress = 1 - (t.cooldown / t.maxCooldown);
                    t.clockUI.clock.geometry.dispose();
                    t.clockUI.clock.geometry = new THREE.RingGeometry(0.01, 0.7, 32, 1, Math.PI / 2, -Math.PI * 2 * progress);
                } else {
                    t.clockUI.visible = false;
                    if (t.storage >= 1 && enemies.length > 0) {
                        t.state = 'OPENING';
                        t.stateTimer = 0;
                    }
                }
            }

            if (t.state === 'OPENING') {
                t.stateTimer += 0.02;
                t.doors.L.position.x = -0.75 - t.stateTimer * 0.7;
                t.doors.R.position.x = 0.75 + t.stateTimer * 0.7;
                t.launcher.position.y = 0.3 + t.stateTimer * 0.5;
                if (t.stateTimer >= 1) { t.state = 'FIRING'; t.stateTimer = 0; }
            }

            if (t.state === 'FIRING') {
                if (frame % 15 === 0) {
                    const target = enemies[Math.floor(Math.random() * enemies.length)];
                    if (target) spawnProjectile(t, target, t.damage);
                    t.stateTimer++;
                    if (t.stateTimer >= 6) {
                        t.state = 'CLOSING';
                        t.stateTimer = 1;
                        t.storage--;
                        t.cooldown = t.maxCooldown;
                    }
                }
            }

            if (t.state === 'CLOSING') {
                t.stateTimer -= 0.02;
                t.doors.L.position.x = -0.75 - t.stateTimer * 0.7;
                t.doors.R.position.x = 0.75 + t.stateTimer * 0.7;
                t.launcher.position.y = 0.3 + t.stateTimer * 0.5;
                if (t.stateTimer <= 0) { t.state = 'WAITING'; }
            }
        } else {
            if (t.cooldown > 0) t.cooldown--;
            if (t.shotQueue.length > 0 && frame % 8 === 0) {
                const shot = t.shotQueue.shift();
                spawnProjectile(t, shot.target, shot.damage, true);
            }
            if (t.storage >= 1 && frame % 40 === 0) dispatchEnergy(t, 1, true);
            if (!t.target || t.target.dead || t.mesh.position.distanceTo(t.target.mesh.position) > t.range) {
                t.target = enemies.find(e => t.mesh.position.distanceTo(e.mesh.position) < t.range);
            }
            if (t.target) {
                t.head.lookAt(t.target.mesh.position);
                if (t.type === 'RIFLE' && t.level >= 10) {
                    if (t.storage >= 1 && t.cooldown <= 0) { spawnProjectile(t, t.target, t.damage); t.storage--; t.cooldown = 4; }
                    t.barrels.rotation.z += 0.2;
                } else if (t.type === 'ROCKET') {
                    if (t.storage >= 1 && t.cooldown <= 0) {
                        const damagePerShot = t.damage / 4;
                        for (let k = 0; k < 4; k++) t.shotQueue.push({ target: t.target, damage: damagePerShot });
                        t.storage--; t.cooldown = t.maxCooldown;
                    }
                } else if (t.storage >= 1 && t.cooldown <= 0) {
                    spawnProjectile(t, t.target, t.damage); t.storage--; t.cooldown = t.maxCooldown;
                }
            }
        }
    });

    function spawnProjectile(t, target, damage, fromQueue = false) {
        const weaponColor = TOWER_TYPES[t.type].color;
        let geo = t.type === 'SILO' ? new THREE.CylinderGeometry(0.1, 0.1, 0.8) : (t.type === 'CANNON' ? new THREE.BoxGeometry(0.7, 0.7, 0.7) : new THREE.SphereGeometry(0.25));
        const pMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: weaponColor }));
        let spawnPos = new THREE.Vector3();
        if (t.type === 'SILO') {
            spawnPos.set(t.x, 1.5, t.z);
            pMesh.rotation.x = Math.PI / 2;
        } else {
            spawnPos.applyMatrix4(t.head.matrixWorld);
        }
        pMesh.position.copy(spawnPos); scene.add(pMesh);
        projectiles.push({ mesh: pMesh, target, damage, speed: t.type === 'SILO' ? 0.8 : 1.2, aoe: t.aoe, color: weaponColor, type: t.type });
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        const dir = p.target.mesh.position.clone().sub(p.mesh.position).normalize();
        p.mesh.position.add(dir.multiplyScalar(p.speed));
        if (p.mesh.position.distanceTo(p.target.mesh.position) < 1.5) {
            if (p.aoe > 0) {
                enemies.forEach(e => {
                    const dist = e.mesh.position.distanceTo(p.mesh.position);
                    if (dist <= p.aoe) e.health -= p.damage * (1 - (dist / p.aoe) * 0.3);
                });
                createExplosionEffect(p.mesh.position, p.aoe, p.color);
            } else p.target.health -= p.damage;
            scene.remove(p.mesh); projectiles.splice(i, 1);
        } else if (p.target.dead) { scene.remove(p.mesh); projectiles.splice(i, 1); }
    }

    function createExplosionEffect(pos, radius, color) {
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.5, 16, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
        sphere.position.copy(pos); scene.add(sphere);
        let lifetime = 10;
        const interval = setInterval(() => {
            sphere.scale.multiplyScalar(1.2); sphere.material.opacity *= 0.7;
            if (--lifetime <= 0) { scene.remove(sphere); clearInterval(interval); }
        }, 30);
    }

    if (isWaveActive) {
        spawnTimer--;
        if (spawnTimer <= 0 && enemiesToSpawn > 0) { spawnEnemy(); enemiesToSpawn--; spawnTimer = 60; updateUI(); }
        if (enemiesToSpawn === 0 && enemies.length === 0) { isWaveActive = false; if (!isSandboxMode) energy += 200; showMsg(`WAVE CLEAR`); updateUI(); }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.hpBar.quaternion.copy(quat);
        const ratio = Math.max(0, e.health / e.maxHP);
        e.hpBar.fg.scale.x = ratio; e.hpBar.fg.position.x = -1 + ratio;
        const targetVec = new THREE.Vector3(0, 0, 0).sub(e.mesh.position);
        const steering = targetVec.clone().normalize().multiplyScalar(0.045);
        e.velocity.add(steering).clampLength(0, 0.08);
        e.mesh.position.add(e.velocity);
        if (e.velocity.length() > 0.001) {
            e.mesh.lookAt(e.mesh.position.clone().add(e.velocity));
            e.wheels.forEach(w => w.rotateY(e.velocity.length() * 4));
        }
        if (e.mesh.position.length() < 3.5) { health -= 5; e.dead = true; updateUI(); }
        if (e.health <= 0) {
            e.dead = true;
            const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
            s.position.copy(e.mesh.position); scene.add(s); shards.push({ mesh: s, value: 25, claimed: false });
        }
        if (e.dead) { scene.remove(e.mesh); enemies.splice(i, 1); updateUI(); }
    }

    for (let i = gatherers.length - 1; i >= 0; i--) {
        const g = gatherers[i];
        g.props.forEach(p => p.rotation.y += 0.5);
        if (g.returning) {
            g.mesh.position.lerp(new THREE.Vector3(0, 3, 0), 0.05);
            if (g.mesh.position.distanceTo(new THREE.Vector3(0, 3, 0)) < 1.0) { if (!isSandboxMode) energy += g.storage; g.storage = 0; g.returning = false; updateUI(); }
        } else {
            if (!g.target || g.target.claimed === false) { g.target = shards.find(s => !s.claimed); if (g.target) g.target.claimed = true; }
            if (g.target) {
                g.mesh.position.lerp(g.target.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 0.05);
                if (g.mesh.position.distanceTo(g.target.mesh.position) < 2.5) {
                    g.storage += g.target.value; scene.remove(g.target.mesh); shards.splice(shards.indexOf(g.target), 1); g.target = null;
                    if (g.storage >= g.capacity) g.returning = true;
                }
            } else if (g.storage > 0) g.returning = true;
        }
    }

    coreGroup.rotation.y += 0.005;
    renderer.render(scene, camera);
}

document.getElementById('up-confirm').onclick = () => {
    if (!selectedNode) return;
    const cost = selectedNode.isCore ? core.upgradeCost : selectedNode.upgradeCost;
    if (isSandboxMode || energy >= cost) {
        if (!isSandboxMode) energy -= cost;
        if (selectedNode.isCore) {
            core.level++;
            core.pulseInterval = core.basePulseInterval / (1 + (core.level - 1) * 0.1);
            core.repairRate = (0.01 + (core.level - 1) * 0.001) / 60;
            core.capacity += 25;
            core.upgradeCost += 100;
            if (gatherers.length < 6) createGatherer();
            updateCoreArchitecture();
        } else {
            const cfg = TOWER_TYPES[selectedNode.type];
            selectedNode.level++;
            selectedNode.damage *= 1.25;
            if (selectedNode.range < cfg.maxRange) {
                selectedNode.range = Math.min(cfg.maxRange, selectedNode.range * 1.1);
            }
            selectedNode.maxCooldown *= 0.9;
            selectedNode.upgradeCost = Math.floor(selectedNode.upgradeCost * 1.6);
            updateTowerBarrels(selectedNode);

            // Update range ring if visible
            if (towerRangeRing.visible) {
                towerRangeRing.geometry.dispose();
                towerRangeRing.geometry = new THREE.RingGeometry(selectedNode.range - 0.1, selectedNode.range + 0.1, 64);
            }
        }
        updateUI();
        renderUpgradeStats();
    }
};

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
animate();
updateUI();