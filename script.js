import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

/* =========================================================
   DOM
========================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const viewport = $("#viewport");

/* =========================================================
   THREE CORE
========================================================= */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101214);

const camera = new THREE.PerspectiveCamera(
    50,
    1,
    0.01,
    50000
);

camera.position.set(7, 5, 9);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true
});

renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 2)
);

renderer.outputColorSpace = THREE.SRGBColorSpace;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type =
    THREE.PCFSoftShadowMap;

viewport.appendChild(renderer.domElement);

/* =========================================================
   CAMERA CONTROLS
========================================================= */

const orbit = new OrbitControls(
    camera,
    renderer.domElement
);

orbit.enableDamping = true;
orbit.dampingFactor = 0.08;

orbit.target.set(0, 1, 0);

orbit.minDistance = 0.15;
orbit.maxDistance = 100000;

/* =========================================================
   TRANSFORM GIZMO
========================================================= */

const transform = new TransformControls(
    camera,
    renderer.domElement
);

transform.setSize(0.9);

transform.showX = true;
transform.showY = true;
transform.showZ = true;

scene.add(transform);

/* =========================================================
   INFINITE BUILD GRID
========================================================= */

const GRID_SIZE = 200;
const GRID_DIVISIONS = 40;
const GRID_STEP =
    GRID_SIZE / GRID_DIVISIONS;

const grid = new THREE.GridHelper(
    GRID_SIZE,
    GRID_DIVISIONS,
    0x4b5057,
    0x2b2f34
);

grid.material.transparent = true;
grid.material.opacity = 0.72;

scene.add(grid);

const axes = new THREE.AxesHelper(3);

scene.add(axes);

/*
    Grid ini hanya visual.

    Tidak ada batas build sebenarnya.
    Object tetap bisa berada di:
    X 100000
    Y 50000
    Z -90000

    Grid akan mengikuti posisi kamera.
*/

function updateInfiniteGrid() {
    const x =
        Math.floor(
            camera.position.x /
                GRID_STEP
        ) * GRID_STEP;

    const z =
        Math.floor(
            camera.position.z /
                GRID_STEP
        ) * GRID_STEP;

    grid.position.x = x;
    grid.position.z = z;
}

/* =========================================================
   LIGHTING
========================================================= */

const ambient =
    new THREE.AmbientLight(
        0xffffff,
        0.55
    );

ambient.name = "Ambient Light";

scene.add(ambient);

const sun =
    new THREE.DirectionalLight(
        0xffffff,
        1.4
    );

sun.name = "Directional Light";

sun.position.set(5, 9, 4);

sun.castShadow = true;

sun.shadow.mapSize.set(
    2048,
    2048
);

scene.add(sun);

const point =
    new THREE.PointLight(
        0x88aaff,
        25,
        30
    );

point.name = "Point Light";

point.position.set(
    -3,
    4,
    3
);

scene.add(point);

/* =========================================================
   STATE
========================================================= */

const raycaster =
    new THREE.Raycaster();

const mouse =
    new THREE.Vector2();

let selected = null;

let tool = "translate";

let projectName =
    "MyProject";

let dirty = false;

let saveHandle = null;

let playing = false;

let frame = 1;

let animationTime = 0;

let lastAnimationTime =
    performance.now();

let history = [];

let future = [];

let restoring = false;

const animData = new Map();

const FPS = 30;

const MAX_FRAME = 240;

/* =========================================================
   RESIZE
========================================================= */

function resize() {
    const width =
        Math.max(
            1,
            viewport.clientWidth
        );

    const height =
        Math.max(
            1,
            viewport.clientHeight
        );

    camera.aspect =
        width / height;

    camera.updateProjectionMatrix();

    renderer.setSize(
        width,
        height,
        false
    );
}

addEventListener(
    "resize",
    resize
);

resize();

/* =========================================================
   MATERIAL
========================================================= */

function makeMat() {
    return new THREE.MeshStandardMaterial({
        color: 0x6688aa,
        metalness: 0.15,
        roughness: 0.55,
        transparent: true,
        opacity: 1,
        emissive: 0x000000
    });
}

/* =========================================================
   GEOMETRY
========================================================= */

function geometry(type) {
    switch (type) {
        case "box":
            return new THREE.BoxGeometry(
                2,
                2,
                2
            );

        case "sphere":
            return new THREE.SphereGeometry(
                1,
                32,
                20
            );

        case "cylinder":
            return new THREE.CylinderGeometry(
                1,
                1,
                2,
                32
            );

        case "cone":
            return new THREE.ConeGeometry(
                1,
                2,
                32
            );

        case "plane":
            return new THREE.PlaneGeometry(
                3,
                3
            );

        case "torus":
            return new THREE.TorusGeometry(
                1,
                0.32,
                16,
                40
            );

        default:
            return new THREE.BoxGeometry(
                2,
                2,
                2
            );
    }
}

/* =========================================================
   OBJECT CREATION
========================================================= */

function addObject(
    type,
    focus = true
) {
    const object =
        new THREE.Mesh(
            geometry(type),
            makeMat()
        );

    object.name =
        type.charAt(0).toUpperCase() +
        type.slice(1);

    object.userData.primitive =
        type;

    object.position.y =
        type === "plane"
            ? 0
            : 0;

    object.castShadow = true;
    object.receiveShadow = true;

    scene.add(object);

    select(object);

    if (focus) {
        focusObject(object);
    }

    mark();

    pushHistory();

    return object;
}

/* =========================================================
   SELECTION
========================================================= */

function select(object) {
    if (selected) {
        selected.material.emissive.setHex(
            selected.userData.baseEmissive ??
                0
        );
    }

    selected = object;

    if (selected) {
        selected.userData.baseEmissive =
            selected.material.emissive.getHex();

        selected.material.emissive.setHex(
            0x24384a
        );

        transform.attach(
            selected
        );

        $("#selectionLabel").textContent =
            selected.name;
    } else {
        transform.detach();

        $("#selectionLabel").textContent =
            "Nothing selected";
    }

    renderList();

    renderProps();
}

/* =========================================================
   DELETE
========================================================= */

function deleteSelected() {
    if (!selected) {
        return;
    }

    const object = selected;

    select(null);

    scene.remove(object);

    object.geometry?.dispose();

    object.material?.dispose();

    animData.delete(object);

    mark();

    pushHistory();

    toast(
        "Object deleted"
    );
}

/* =========================================================
   FOCUS OBJECT
========================================================= */

function focusObject(object) {
    const box =
        new THREE.Box3()
            .setFromObject(object);

    const center =
        box.getCenter(
            new THREE.Vector3()
        );

    const size =
        Math.max(
            1,
            box
                .getSize(
                    new THREE.Vector3()
                )
                .length()
        );

    orbit.target.copy(
        center
    );

    camera.position.copy(
        center
    ).add(
        new THREE.Vector3(
            size * 0.7,
            size * 0.45,
            size * 0.7
        )
    );

    orbit.update();

    updateInfiniteGrid();
}

/* =========================================================
   TRANSFORM TOOL
========================================================= */

function setTool(type) {
    tool = type;

    transform.setMode(
        type
    );

    transform.setSize(
        0.9
    );

    $$(".tool[data-tool]")
        .forEach(
            (button) => {
                button.classList.toggle(
                    "active",
                    button.dataset.tool ===
                        type
                );
            }
        );

    $("#modeLabel").textContent =
        type === "translate"
            ? "Move"
            : type === "rotate"
                ? "Rotate"
                : "Scale";
}

transform.addEventListener(
    "dragging-changed",
    (event) => {
        orbit.enabled =
            !event.value;
    }
);

transform.addEventListener(
    "objectChange",
    () => {
        renderProps();

        mark(false);
    }
);

transform.addEventListener(
    "mouseUp",
    () => {
        pushHistory();
    }
);

/* =========================================================
   OUTLINER
========================================================= */

function renderList() {
    const box =
        $("#objectList");

    box.innerHTML = "";

    scene.children
        .filter(
            (object) =>
                object.isMesh
        )
        .forEach(
            (object) => {
                const row =
                    document.createElement(
                        "div"
                    );

                row.className =
                    "object-row" +
                    (
                        object ===
                        selected
                            ? " selected"
                            : ""
                    );

                row.innerHTML = `
                    <span>◇</span>
                    <span>
                        ${esc(
                            object.name
                        )}
                    </span>

                    <button class="eye">
                        ${
                            object.visible
                                ? "◉"
                                : "○"
                        }
                    </button>
                `;

                row.onclick =
                    (event) => {
                        if (
                            event.target
                                .classList
                                .contains(
                                    "eye"
                                )
                        ) {
                            object.visible =
                                !object.visible;

                            mark();

                            pushHistory();

                            renderList();

                            return;
                        }

                        select(
                            object
                        );
                    };

                box.appendChild(
                    row
                );
            }
        );
}

/* =========================================================
   PROPERTIES
========================================================= */

function renderProps() {
    const box =
        $("#propertiesContent");

    if (!selected) {
        box.innerHTML = `
            <div class="empty">
                Select an object to edit its properties.
            </div>
        `;

        return;
    }

    const object =
        selected;

    const material =
        object.material;

    box.innerHTML = `
        <div class="group">
            <div class="group-title">
                Transform
            </div>

            ${vec(
                "Position",
                object.position,
                "pos"
            )}

            ${vec(
                "Rotation",
                object.rotation,
                "rot",
                true
            )}

            ${vec(
                "Scale",
                object.scale,
                "scale"
            )}
        </div>

        <div class="group">
            <div class="group-title">
                Material
            </div>

            <div class="prop">
                <label>
                    Color
                </label>

                <input
                    id="pColor"
                    class="color"
                    type="color"
                    value="#${material.color.getHexString()}"
                >
            </div>

            <div class="prop">
                <label>
                    Emissive
                </label>

                <input
                    id="pEmissive"
                    class="color"
                    type="color"
                    value="#${material.emissive.getHexString()}"
                >
            </div>

            <div class="prop">
                <label>
                    Metalness
                </label>

                <input
                    id="pMetal"
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value="${material.metalness}"
                >
            </div>

            <div class="prop">
                <label>
                    Roughness
                </label>

                <input
                    id="pRough"
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value="${material.roughness}"
                >
            </div>

            <div class="prop">
                <label>
                    Opacity
                </label>

                <input
                    id="pOpacity"
                    type="range"
                    min="0.05"
                    max="1"
                    step=".01"
                    value="${material.opacity}"
                >
            </div>
        </div>

        <div class="group">
            <div class="group-title">
                Object
            </div>

            <div class="prop">
                <label>
                    Name
                </label>

                <input
                    id="pName"
                    type="text"
                    value="${esc(
                        object.name
                    )}"
                >
            </div>
        </div>
    `;

    $$(".v")
        .forEach(
            (input) => {
                input.addEventListener(
                    "input",
                    () => {
                        const attribute =
                            input.dataset.a;

                        const axis =
                            input.dataset.b;

                        selected[
                            attribute
                        ][axis] =
                            Number(
                                input.value
                            );

                        mark(false);
                    }
                );
            }
        );

    $("#pColor").oninput =
        () => {
            material.color.set(
                $("#pColor").value
            );

            mark(false);
        };

    $("#pEmissive").oninput =
        () => {
            material.emissive.set(
                $("#pEmissive").value
            );

            mark(false);
        };

    $("#pMetal").oninput =
        () => {
            material.metalness =
                +$("#pMetal").value;

            mark(false);
        };

    $("#pRough").oninput =
        () => {
            material.roughness =
                +$("#pRough").value;

            mark(false);
        };

    $("#pOpacity").oninput =
        () => {
            material.opacity =
                +$("#pOpacity").value;

            material.transparent =
                material.opacity < 1;

            mark(false);
        };

    $("#pName").onchange =
        () => {
            object.name =
                $("#pName").value.trim() ||
                "Object";

            renderList();

            mark();

            pushHistory();
        };
}

/* =========================================================
   VECTOR INPUT
========================================================= */

function vec(
    label,
    value,
    key,
    rotation = false
) {
    return `
        <div class="prop">
            <label>
                ${label}
            </label>

            <div class="triple">
                ${
                    ["x", "y", "z"]
                        .map(
                            (axis) => `
                                <input
                                    class="v"
                                    data-a="${
                                        key === "rot"
                                            ? "rotation"
                                            : key
                                    }"
                                    data-b="${axis}"
                                    type="number"
                                    step="${
                                        rotation
                                            ? ".01"
                                            : ".1"
                                    }"
                                    value="${value[
                                        axis
                                    ].toFixed(
                                        3
                                    )}"
                                >
                            `
                        )
                        .join("")
                }
            </div>
        </div>
    `;
}

/* =========================================================
   ESCAPE HTML
========================================================= */

function esc(value) {
    return String(value).replace(
        /[&<>"']/g,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[
                character
            ]
    );
}

/* =========================================================
   SCENE DATA
========================================================= */

function sceneData() {
    return {
        version: 2,

        name:
            projectName,

        background:
            scene.background.getHex(),

        camera: {
            p:
                camera.position.toArray(),

            q:
                camera.quaternion.toArray(),

            target:
                orbit.target.toArray()
        },

        lights: {
            ambient:
                ambient.intensity,

            sun:
                sun.intensity,

            point:
                point.intensity
        },

        objects:
            scene.children
                .filter(
                    (object) =>
                        object.isMesh
                )
                .map(
                    (object) => ({
                        name:
                            object.name,

                        primitive:
                            object
                                .userData
                                .primitive ||
                            "box",

                        position:
                            object.position
                                .toArray(),

                        rotation:
                            object.rotation
                                .toArray(),

                        scale:
                            object.scale
                                .toArray(),

                        visible:
                            object.visible,

                        material: {
                            color:
                                object
                                    .material
                                    .color
                                    .getHex(),

                            emissive:
                                object
                                    .material
                                    .emissive
                                    .getHex(),

                            metalness:
                                object
                                    .material
                                    .metalness,

                            roughness:
                                object
                                    .material
                                    .roughness,

                            opacity:
                                object
                                    .material
                                    .opacity
                        },

                        animation:
                            animData.get(
                                object
                            ) || []
                    })
                )
    };
}

/* =========================================================
   CLEAR SCENE
========================================================= */

function clearObjects() {
    scene.children
        .filter(
            (object) =>
                object.isMesh
        )
        .forEach(
            (object) => {
                object.geometry?.dispose();

                object.material?.dispose();

                scene.remove(
                    object
                );
            }
        );

    animData.clear();

    select(null);
}

/* =========================================================
   LOAD JSON PROJECT
========================================================= */

function loadData(data) {
    if (
        !data ||
        !Array.isArray(
            data.objects
        )
    ) {
        throw new Error(
            "Invalid Mini Blender JSON"
        );
    }

    clearObjects();

    projectName =
        data.name ||
        "MyProject";

    scene.background.set(
        data.background ??
            0x101214
    );

    if (data.camera) {
        camera.position.fromArray(
            data.camera.p ||
                [7, 5, 9]
        );

        camera.quaternion.fromArray(
            data.camera.q ||
                [0, 0, 0, 1]
        );

        orbit.target.fromArray(
            data.camera.target ||
                [0, 1, 0]
        );
    }

    data.objects.forEach(
        (item) => {
            const object =
                new THREE.Mesh(
                    geometry(
                        item.primitive ||
                            "box"
                    ),
                    makeMat()
                );

            object.name =
                item.name ||
                "Object";

            object.userData.primitive =
                item.primitive ||
                "box";

            object.position.fromArray(
                item.position ||
                    [0, 0, 0]
            );

            object.rotation.fromArray(
                item.rotation ||
                    [0, 0, 0]
            );

            object.scale.fromArray(
                item.scale ||
                    [1, 1, 1]
            );

            object.visible =
                item.visible !==
                false;

            const material =
                item.material ||
                {};

            if (
                material.color !=
                null
            ) {
                object.material.color.set(
                    material.color
                );
            }

            if (
                material.emissive !=
                null
            ) {
                object.material.emissive.set(
                    material.emissive
                );
            }

            if (
                material.metalness !=
                null
            ) {
                object.material.metalness =
                    material.metalness;
            }

            if (
                material.roughness !=
                null
            ) {
                object.material.roughness =
                    material.roughness;
            }

            if (
                material.opacity !=
                null
            ) {
                object.material.opacity =
                    material.opacity;

                object.material.transparent =
                    material.opacity <
                    1;
            }

            object.castShadow =
                true;

            object.receiveShadow =
                true;

            scene.add(
                object
            );

            animData.set(
                object,

                Array.isArray(
                    item.animation
                )
                    ? item.animation
                    : []
            );
        }
    );

    if (data.lights) {
        ambient.intensity =
            data.lights.ambient ??
            0.55;

        sun.intensity =
            data.lights.sun ??
            1.4;

        point.intensity =
            data.lights.point ??
            25;
    }

    playing = false;

    frame = 1;

    animationTime = 0;

    $("#frameInput").value =
        1;

    $("#playhead").style.left =
        "0%";

    orbit.update();

    updateInfiniteGrid();

    renderList();

    renderProps();

    dirty = false;

    updateTitle();

    $("#status").textContent =
        "Loaded";
}

/* =========================================================
   DIRTY STATE
========================================================= */

function mark(show = true) {
    dirty = true;

    updateTitle();

    $("#status").textContent =
        "Unsaved Changes";

    if (show) {
        toast(
            "Unsaved Changes"
        );
    }
}

function updateTitle() {
    $("#projectTitle").textContent =
        projectName +
        (
            dirty
                ? "*"
                : ""
        );

    $("#dirtyDot").textContent =
        dirty
            ? "●"
            : "";

    document.title =
        projectName +
        (
            dirty
                ? "*"
                : ""
        ) +
        " — Mini Blender";
}

/* =========================================================
   UNDO / REDO
========================================================= */

function pushHistory() {
    if (restoring) {
        return;
    }

    const state =
        JSON.stringify(
            sceneData()
        );

    if (
        history.at(-1) ===
        state
    ) {
        return;
    }

    history.push(
        state
    );

    if (
        history.length >
        60
    ) {
        history.shift();
    }

    future = [];
}

function restore(state) {
    restoring = true;

    try {
        loadData(
            JSON.parse(state)
        );
    } finally {
        restoring = false;
    }
}

function undo() {
    if (
        history.length <
        2
    ) {
        return;
    }

    future.push(
        history.pop()
    );

    restore(
        history.at(-1)
    );

    toast("Undo");
}

function redo() {
    if (
        !future.length
    ) {
        return;
    }

    const state =
        future.pop();

    history.push(
        state
    );

    restore(state);

    toast("Redo");
}

/* =========================================================
   DOWNLOAD
========================================================= */

function downloadBlob(
    blob,
    name
) {
    const url =
        URL.createObjectURL(
            blob
        );

    const link =
        document.createElement(
            "a"
        );

    link.href = url;

    link.download =
        name;

    document.body.appendChild(
        link
    );

    link.click();

    link.remove();

    setTimeout(
        () => {
            URL.revokeObjectURL(
                url
            );
        },
        1000
    );
}

/* =========================================================
   SAVE
========================================================= */

async function save(
    as = false
) {
    try {
        const data =
            JSON.stringify(
                sceneData(),
                null,
                2
            );

        const blob =
            new Blob(
                [data],
                {
                    type:
                        "application/json"
                }
            );

        $("#status").textContent =
            "Saving...";

        const name =
            projectName +
            ".json";

        if (
            as ||
            !saveHandle
        ) {
            if (
                "showSaveFilePicker" in
                window
            ) {
                saveHandle =
                    await window.showSaveFilePicker(
                        {
                            suggestedName:
                                name,

                            types: [
                                {
                                    description:
                                        "Mini Blender Project",

                                    accept: {
                                        "application/json":
                                            [
                                                ".json"
                                            ]
                                    }
                                }
                            ]
                        }
                    );
            } else {
                downloadBlob(
                    blob,
                    name
                );

                dirty = false;

                updateTitle();

                $("#status").textContent =
                    "Saved";

                localStorage.setItem(
                    "miniBlenderRecovery",
                    data
                );

                toast(
                    "Project saved successfully."
                );

                return;
            }
        }

        const writable =
            await saveHandle
                .createWritable();

        await writable.write(
            blob
        );

        await writable.close();

        dirty = false;

        updateTitle();

        $("#status").textContent =
            "Saved";

        localStorage.setItem(
            "miniBlenderRecent",
            JSON.stringify({
                name:
                    projectName,

                data,

                time:
                    Date.now()
            })
        );

        localStorage.setItem(
            "miniBlenderRecovery",
            data
        );

        toast(
            "Project saved successfully."
        );
    } catch (
        error
    ) {
        if (
            error.name !==
            "AbortError"
        ) {
            toast(
                "Save failed: " +
                error.message
            );
        }
    }
}

/* =========================================================
   OPEN PROJECT
========================================================= */

function openProject() {
    $("#projectFile").click();
}

$("#projectFile").onchange =
    async (event) => {
        const file =
            event.target
                .files[0];

        if (!file) {
            return;
        }

        try {
            const data =
                JSON.parse(
                    await file.text()
                );

            loadData(
                data
            );

            saveHandle =
                null;

            history = [
                JSON.stringify(
                    sceneData()
                )
            ];

            future = [];

            toast(
                "Project loaded successfully."
            );
        } catch (
            error
        ) {
            toast(
                "Failed to load project: " +
                error.message
            );
        }

        event.target.value =
            "";
    };

/* =========================================================
   NEW PROJECT
========================================================= */

async function newProject() {
    const createNew =
        async () => {
            playing = false;

            animationTime =
                0;

            frame = 1;

            clearObjects();

            projectName =
                "MyProject";

            camera.position.set(
                7,
                5,
                9
            );

            orbit.target.set(
                0,
                1,
                0
            );

            scene.background.set(
                0x101214
            );

            dirty = false;

            saveHandle =
                null;

            history = [
                JSON.stringify(
                    sceneData()
                )
            ];

            future = [];

            updateInfiniteGrid();

            renderList();

            renderProps();

            updateTitle();

            $("#frameInput").value =
                1;

            $("#playhead").style.left =
                "0%";

            $("#status").textContent =
                "New Project";
        };

    if (dirty) {
        dialog(
            "Unsaved Changes",

            "You have unsaved changes. Save before creating a new project?",

            [
                {
                    t:
                        "Save",

                    c:
                        async () => {
                            await save(
                                true
                            );

                            await createNew();
                        }
                },

                {
                    t:
                        "Don't Save",

                    c:
                        createNew
                },

                {
                    t:
                        "Cancel"
                }
            ]
        );
    } else {
        createNew();
    }
}

/* =========================================================
   DIALOG
========================================================= */

function dialog(
    title,
    text,
    buttons
) {
    $("#dialogTitle")
        .textContent =
        title;

    $("#dialogText")
        .textContent =
        text;

    const actions =
        $("#dialogActions");

    actions.innerHTML =
        "";

    buttons.forEach(
        (
            button,
            index
        ) => {
            const element =
                document.createElement(
                    "button"
                );

            element.textContent =
                button.t;

            element.className =
                index === 0
                    ? "primary"
                    : "";

            element.onclick =
                () => {
                    $(
                        "#dialog"
                    ).classList.add(
                        "hidden"
                    );

                    button.c?.();
                };

            actions.appendChild(
                element
            );
        }
    );

    $("#dialog")
        .classList.remove(
            "hidden"
        );
}

/* =========================================================
   TOAST
========================================================= */

function toast(
    message
) {
    const element =
        $("#toast");

    element.textContent =
        message;

    element.classList.add(
        "show"
    );

    clearTimeout(
        toast.t
    );

    toast.t =
        setTimeout(
            () => {
                element.classList.remove(
                    "show"
                );
            },
            2200
        );
}

/* =========================================================
   EXPORT
========================================================= */

function exportFile(
    kind
) {
    const root =
        new THREE.Group();

    scene.children
        .filter(
            (object) =>
                object.isMesh
        )
        .forEach(
            (object) => {
                root.add(
                    object.clone()
                );
            }
        );

    try {
        if (
            kind ===
            "json"
        ) {
            downloadBlob(
                new Blob(
                    [
                        JSON.stringify(
                            sceneData(),
                            null,
                            2
                        )
                    ],
                    {
                        type:
                            "application/json"
                    }
                ),

                projectName +
                    ".json"
            );

            toast(
                "Export completed."
            );

            return;
        }

        if (
            kind ===
            "png"
        ) {
            renderer.domElement.toBlob(
                (blob) => {
                    if (blob) {
                        downloadBlob(
                            blob,
                            projectName +
                                ".png"
                        );
                    }
                },
                "image/png"
            );

            return;
        }

        if (
            kind ===
            "obj"
        ) {
            const result =
                new OBJExporter()
                    .parse(
                        root
                    );

            downloadBlob(
                new Blob(
                    [result],
                    {
                        type:
                            "text/plain"
                    }
                ),

                projectName +
                    ".obj"
            );

            toast(
                "Export completed."
            );

            return;
        }

        new GLTFExporter()
            .parse(
                root,

                (result) => {
                    const binary =
                        kind ===
                        "glb";

                    downloadBlob(
                        new Blob(
                            [result],
                            {
                                type:
                                    binary
                                        ? "model/gltf-binary"
                                        : "model/gltf+json"
                            }
                        ),

                        projectName +
                            (
                                binary
                                    ? ".glb"
                                    : ".gltf"
                            )
                    );

                    toast(
                        "Export completed."
                    );
                },

                {
                    binary:
                        kind ===
                        "glb",

                    onlyVisible:
                        false
                }
            );
    } catch (
        error
    ) {
        toast(
            "Export failed: " +
            error.message
        );
    }
}

/* =========================================================
   GLTF IMPORT
========================================================= */

function importGLTF(
    file
) {
    const url =
        URL.createObjectURL(
            file
        );

    new GLTFLoader().load(
        url,

        (gltf) => {
            gltf.scene.traverse(
                (object) => {
                    if (
                        object.isMesh
                    ) {
                        object.userData.primitive =
                            "box";

                        object.castShadow =
                            true;

                        object.receiveShadow =
                            true;
                    }
                }
            );

            scene.add(
                gltf.scene
            );

            const firstMesh =
                gltf.scene
                    .getObjectByProperty(
                        "isMesh",
                        true
                    );

            if (firstMesh) {
                select(
                    firstMesh
                );
            }

            mark();

            pushHistory();

            toast(
                "Model imported."
            );

            URL.revokeObjectURL(
                url
            );
        },

        undefined,

        (error) => {
            URL.revokeObjectURL(
                url
            );

            toast(
                "Import failed: " +
                error.message
            );
        }
    );
}

/* =========================================================
   OBJ IMPORT
========================================================= */

function importOBJ(
    file
) {
    const url =
        URL.createObjectURL(
            file
        );

    new OBJLoader().load(
        url,

        (object) => {
            object.traverse(
                (child) => {
                    if (
                        child.isMesh
                    ) {
                        child.material =
                            makeMat();

                        child.castShadow =
                            true;

                        child.receiveShadow =
                            true;

                        child.userData.primitive =
                            "box";
                    }
                }
            );

            scene.add(
                object
            );

            const firstMesh =
                object.getObjectByProperty(
                    "isMesh",
                    true
                );

            if (firstMesh) {
                select(
                    firstMesh
                );
            }

            mark();

            pushHistory();

            toast(
                "OBJ imported."
            );

            URL.revokeObjectURL(
                url
            );
        },

        undefined,

        (error) => {
            URL.revokeObjectURL(
                url
            );

            toast(
                "Import failed: " +
                error.message
            );
        }
    );
}

/* =========================================================
   ADD OBJECT BUTTONS
========================================================= */

$$("[data-add]")
    .forEach(
        (button) => {
            button.onclick =
                () => {
                    addObject(
                        button.dataset.add
                    );
                };
        }
    );

/* =========================================================
   TOOL BUTTONS
========================================================= */

$$("[data-tool]")
    .forEach(
        (button) => {
            button.onclick =
                () => {
                    setTool(
                        button.dataset.tool
                    );
                };
        }
    );

/* =========================================================
   ADD MENU
========================================================= */

$("#addMenu").onclick =
    () => {
        addObject(
            "box"
        );
    };

/* =========================================================
   MORE MENU
========================================================= */

$("#moreBtn").onclick =
    () => {
        $("#contextMenu")
            .classList.toggle(
                "hidden"
            );
    };

/* =========================================================
   EXPORT BUTTONS
========================================================= */

$$("[data-export]")
    .forEach(
        (button) => {
            button.onclick =
                () => {
                    exportFile(
                        button.dataset.export
                    );

                    $("#contextMenu")
                        .classList.add(
                            "hidden"
                        );
                };
        }
    );

/* =========================================================
   IMPORT BUTTONS
========================================================= */

$$("[data-import]")
    .forEach(
        (button) => {
            button.onclick =
                () => {
                    $("#importFile")
                        .accept =
                        button.dataset.import ===
                        "obj"
                            ? ".obj"
                            : ".gltf,.glb,.json";

                    $("#importFile")
                        .click();

                    $("#contextMenu")
                        .classList.add(
                            "hidden"
                        );
                };
        }
    );

/* =========================================================
   UNIVERSAL IMPORT
========================================================= */

$("#importFile").onchange =
    (event) => {
        const file =
            event.target
                .files[0];

        if (!file) {
            return;
        }

        const name =
            file.name.toLowerCase();

        if (
            name.endsWith(
                ".json"
            )
        ) {
            file.text()
                .then(
                    (text) => {
                        try {
                            loadData(
                                JSON.parse(
                                    text
                                )
                            );

                            history = [
                                JSON.stringify(
                                    sceneData()
                                )
                            ];

                            future = [];

                            toast(
                                "Scene imported."
                            );
                        } catch (
                            error
                        ) {
                            toast(
                                "Failed to load scene: " +
                                error.message
                            );
                        }
                    }
                );
        } else if (
            name.endsWith(
                ".obj"
            )
        ) {
            importOBJ(
                file
            );
        } else {
            importGLTF(
                file
            );
        }

        event.target.value =
            "";
    };

/* =========================================================
   ACTION BUTTONS
========================================================= */

$$("[data-action]")
    .forEach(
        (button) => {
            button.onclick =
                () => {
                    const actions = {
                        new:
                            newProject,

                        open:
                            openProject,

                        save:
                            () =>
                                save(
                                    false
                                ),

                        saveAs:
                            () =>
                                save(
                                    true
                                ),

                        undo,

                        redo
                    };

                    actions[
                        button.dataset.action
                    ]?.();
                };
        }
    );

/* =========================================================
   STOP ANIMATION
========================================================= */

function stopAnimation() {
    playing = false;

    animationTime = 0;

    frame = 1;

    $("#frameInput").value =
        1;

    $("#playhead").style.left =
        "0%";

    if (selected) {
        applyAnimation(
            true
        );
    }

    $("#status").textContent =
        dirty
            ? "Unsaved Changes"
            : "Ready";
}

/* =========================================================
   PLAY
========================================================= */

$("#play").onclick =
    () => {
        if (!selected) {
            toast(
                "Select an animated object first."
            );

            return;
        }

        const animation =
            animData.get(
                selected
            ) || [];

        if (
            animation.length <
            2
        ) {
            toast(
                "Add at least two keyframes first."
            );

            return;
        }

        playing = true;

        lastAnimationTime =
            performance.now();

        $("#status").textContent =
            "Playing";
    };

/* =========================================================
   PAUSE
========================================================= */

$("#pause").onclick =
    () => {
        playing = false;

        $("#status").textContent =
            dirty
                ? "Unsaved Changes"
                : "Paused";
    };

/* =========================================================
   STOP
========================================================= */

$("#stop").onclick =
    () => {
        stopAnimation();
    };

/* =========================================================
   FRAME INPUT
========================================================= */

$("#frameInput").onchange =
    (event) => {
        playing = false;

        frame =
            Math.max(
                1,

                Math.min(
                    MAX_FRAME,

                    Number(
                        event.target
                            .value
                    ) || 1
                )
            );

        animationTime =
            (frame - 1) /
            FPS;

        applyAnimation();

        $("#playhead").style.left =
            (
                (frame - 1) /
                MAX_FRAME
            ) *
                100 +
            "%";
    };

/* =========================================================
   KEYFRAME
========================================================= */

$("#keyframe").onclick =
    () => {
        if (!selected) {
            toast(
                "Select an object first."
            );

            return;
        }

        const frames =
            animData.get(
                selected
            ) || [];

        const keyframe = {
            frame,

            position:
                selected.position
                    .toArray(),

            rotation:
                selected.rotation
                    .toArray(),

            scale:
                selected.scale
                    .toArray()
        };

        const existingIndex =
            frames.findIndex(
                (item) =>
                    item.frame ===
                    frame
            );

        if (
            existingIndex >=
            0
        ) {
            frames[
                existingIndex
            ] = keyframe;
        } else {
            frames.push(
                keyframe
            );
        }

        frames.sort(
            (a, b) =>
                a.frame -
                b.frame
        );

        animData.set(
            selected,
            frames
        );

        mark();

        pushHistory();

        toast(
            `Keyframe ${frame} added.`
        );
    };

/* =========================================================
   TIMELINE RULER
========================================================= */

for (
    let i = 1;
    i <= MAX_FRAME;
    i += 10
) {
    const span =
        document.createElement(
            "span"
        );

    span.textContent =
        i;

    $("#ruler")
        .appendChild(
            span
        );
}

/* =========================================================
   ANIMATION ENGINE
========================================================= */

function applyAnimation(
    resetToStart = false
) {
    if (!selected) {
        return;
    }

    const animation =
        animData.get(
            selected
        ) || [];

    if (
        !animation.length
    ) {
        return;
    }

    if (
        resetToStart
    ) {
        frame = 1;
    }

    if (
        animation.length ===
        1
    ) {
        const only =
            animation[0];

        selected.position.fromArray(
            only.position
        );

        selected.rotation.fromArray(
            only.rotation
        );

        selected.scale.fromArray(
            only.scale
        );

        renderProps();

        return;
    }

    let previous =
        animation[0];

    let next =
        animation[
            animation.length -
                1
        ];

    for (
        const keyframe
        of animation
    ) {
        if (
            keyframe.frame <=
            frame
        ) {
            previous =
                keyframe;
        }

        if (
            keyframe.frame >=
            frame
        ) {
            next =
                keyframe;

            break;
        }
    }

    const range =
        next.frame -
        previous.frame;

    const t =
        range <= 0
            ? 0
            : THREE.MathUtils.clamp(
                (
                    frame -
                    previous.frame
                ) /
                    range,

                0,

                1
            );

    /* -------------------------
       POSITION
    ------------------------- */

    const positionA =
        new THREE.Vector3()
            .fromArray(
                previous.position
            );

    const positionB =
        new THREE.Vector3()
            .fromArray(
                next.position
            );

    selected.position.lerpVectors(
        positionA,
        positionB,
        t
    );

    /* -------------------------
       ROTATION
    ------------------------- */

    const quaternionA =
        new THREE.Quaternion()
            .setFromEuler(
                new THREE.Euler(
                    ...previous.rotation
                )
            );

    const quaternionB =
        new THREE.Quaternion()
            .setFromEuler(
                new THREE.Euler(
                    ...next.rotation
                )
            );

    selected.quaternion.slerpQuaternions(
        quaternionA,
        quaternionB,
        t
    );

    /* -------------------------
       SCALE
    ------------------------- */

    const scaleA =
        new THREE.Vector3()
            .fromArray(
                previous.scale
            );

    const scaleB =
        new THREE.Vector3()
            .fromArray(
                next.scale
            );

    selected.scale.lerpVectors(
        scaleA,
        scaleB,
        t
    );

    renderProps();
}

/* =========================================================
   KEYBOARD SHORTCUTS
========================================================= */

addEventListener(
    "keydown",
    (event) => {
        const key =
            event.key.toLowerCase();

        /* SAVE */

        if (
            (
                event.ctrlKey ||
                event.metaKey
            ) &&
            key === "s"
        ) {
            event.preventDefault();

            save(
                event.shiftKey
            );

            return;
        }

        /* OPEN */

        if (
            (
                event.ctrlKey ||
                event.metaKey
            ) &&
            key === "o"
        ) {
            event.preventDefault();

            openProject();

            return;
        }

        /* NEW */

        if (
            (
                event.ctrlKey ||
                event.metaKey
            ) &&
            key === "n"
        ) {
            event.preventDefault();

            newProject();

            return;
        }

        /* UNDO */

        if (
            (
                event.ctrlKey ||
                event.metaKey
            ) &&
            key === "z"
        ) {
            event.preventDefault();

            if (
                event.shiftKey
            ) {
                redo();
            } else {
                undo();
            }

            return;
        }

        /* REDO */

        if (
            (
                event.ctrlKey ||
                event.metaKey
            ) &&
            key === "y"
        ) {
            event.preventDefault();

            redo();

            return;
        }

        /* INPUT */

        if (
            event.target.matches(
                "input, textarea"
            )
        ) {
            return;
        }

        /* MOVE */

        if (
            key === "g"
        ) {
            setTool(
                "translate"
            );
        }

        /* ROTATE */

        if (
            key === "r"
        ) {
            setTool(
                "rotate"
            );
        }

        /* SCALE */

        if (
            key === "s"
        ) {
            setTool(
                "scale"
            );
        }

        /* FOCUS */

        if (
            key === "f" &&
            selected
        ) {
            focusObject(
                selected
            );
        }

        /* DELETE */

        if (
            event.key ===
            "Delete"
        ) {
            deleteSelected();
        }

        /* ESCAPE */

        if (
            event.key ===
            "Escape"
        ) {
            playing = false;

            transform.detach();
        }
    }
);

/* =========================================================
   VIEWPORT SELECTION
========================================================= */

renderer.domElement.addEventListener(
    "pointerdown",
    (event) => {
        if (
            transform.dragging
        ) {
            return;
        }

        const rect =
            renderer.domElement
                .getBoundingClientRect();

        mouse.x =
            (
                (
                    event.clientX -
                    rect.left
                ) /
                    rect.width
            ) *
                2 -
            1;

        mouse.y =
            -(
                (
                    (
                        event.clientY -
                        rect.top
                    ) /
                        rect.height
                ) *
                    2 -
                1
            );

        raycaster.setFromCamera(
            mouse,
            camera
        );

        const hits =
            raycaster.intersectObjects(
                scene.children.filter(
                    (object) =>
                        object.isMesh
                ),
                true
            );

        if (
            hits.length
        ) {
            let object =
                hits[0].object;

            while (
                object.parent &&
                !object.isMesh
            ) {
                object =
                    object.parent;
            }

            select(
                object
            );
        } else {
            select(
                null
            );
        }
    }
);

/* =========================================================
   RENDER LOOP
========================================================= */

let last =
    performance.now();

function loop(
    now
) {
    requestAnimationFrame(
        loop
    );

    const delta =
        Math.min(
            0.05,

            (
                now -
                last
            ) /
                1000
        );

    last = now;

    /* -------------------------
       ANIMATION PLAYBACK
    ------------------------- */

    if (
        playing
    ) {
        animationTime +=
            delta;

        const nextFrame =
            1 +
            animationTime *
                FPS;

        if (
            nextFrame >=
            MAX_FRAME
        ) {
            animationTime = 0;

            frame = 1;
        } else {
            frame =
                nextFrame;
        }

        $("#frameInput").value =
            Math.floor(
                frame
            );

        $("#playhead").style.left =
            (
                (
                    frame - 1
                ) /
                    MAX_FRAME
            ) *
                100 +
            "%";

        applyAnimation();
    }

    /* -------------------------
       INFINITE GRID
    ------------------------- */

    updateInfiniteGrid();

    /* -------------------------
       CAMERA
    ------------------------- */

    orbit.update();

    /* -------------------------
       RENDER
    ------------------------- */

    renderer.render(
        scene,
        camera
    );
}

requestAnimationFrame(
    loop
);

/* =========================================================
   AUTOSAVE
========================================================= */

setInterval(
    () => {
        if (!dirty) {
            return;
        }

        localStorage.setItem(
            "miniBlenderRecovery",

            JSON.stringify(
                sceneData()
            )
        );
    },

    120000
);

/* =========================================================
   RECOVERY
========================================================= */

const recovery =
    localStorage.getItem(
        "miniBlenderRecovery"
    );

if (recovery) {
    dialog(
        "Recovery version found",

        "A recovery version of your project was found.",

        [
            {
                t:
                    "Recover",

                c:
                    () => {
                        try {
                            loadData(
                                JSON.parse(
                                    recovery
                                )
                            );

                            toast(
                                "Recovery restored."
                            );
                        } catch {
                            toast(
                                "Recovery data is invalid."
                            );
                        }
                    }
            },

            {
                t:
                    "Discard",

                c:
                    () => {
                        localStorage.removeItem(
                            "miniBlenderRecovery"
                        );
                    }
            }
        ]
    );
}

/* =========================================================
   INITIALIZE
========================================================= */

history = [
    JSON.stringify(
        sceneData()
    )
];

renderList();

renderProps();

updateTitle();

updateInfiniteGrid();

setTool(
   "translate"
);
