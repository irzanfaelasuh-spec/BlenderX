import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

/* =========================================================
   DOM HELPERS
========================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const viewport = $("#viewport");

/* =========================================================
   THREE.JS CORE
========================================================= */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101214);

const camera = new THREE.PerspectiveCamera(
    50,
    1,
    0.01,
    5000
);

camera.position.set(7, 5, 9);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true
});

renderer.setPixelRatio(
    Math.min(devicePixelRatio, 2)
);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;

viewport.appendChild(renderer.domElement);

/* =========================================================
   CONTROLS
========================================================= */

const orbit = new OrbitControls(
    camera,
    renderer.domElement
);

orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.target.set(0, 1, 0);

const transform = new TransformControls(
    camera,
    renderer.domElement
);

scene.add(transform);

/* =========================================================
   HELPERS
========================================================= */

const grid = new THREE.GridHelper(
    30,
    30,
    0x4b5057,
    0x2b2f34
);

scene.add(grid);

const axes = new THREE.AxesHelper(3);
scene.add(axes);

/* =========================================================
   LIGHTING
========================================================= */

const ambient = new THREE.AmbientLight(
    0xffffff,
    0.55
);

ambient.name = "Ambient Light";
scene.add(ambient);

const sun = new THREE.DirectionalLight(
    0xffffff,
    1.4
);

sun.name = "Directional Light";
sun.position.set(5, 9, 4);
sun.castShadow = true;

scene.add(sun);

const point = new THREE.PointLight(
    0x88aaff,
    25,
    30
);

point.name = "Point Light";
point.position.set(-3, 4, 3);

scene.add(point);

/* =========================================================
   EDITOR STATE
========================================================= */

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let selected = null;
let tool = "translate";

let projectName = "MyProject";
let dirty = false;

let saveHandle = null;

let playing = false;
let frame = 1;

let history = [];
let future = [];

let restoring = false;

const animData = new Map();

/* =========================================================
   RESIZE
========================================================= */

function resize() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(
        width,
        height,
        false
    );
}

addEventListener("resize", resize);

resize();

/* =========================================================
   MATERIAL / GEOMETRY
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
    }
}

/* =========================================================
   OBJECT MANAGEMENT
========================================================= */

function addObject(type, focus = true) {
    const object = new THREE.Mesh(
        geometry(type),
        makeMat()
    );

    object.name =
        type[0].toUpperCase() +
        type.slice(1);

    object.userData.primitive = type;

    object.position.y =
        type === "plane" ? 0 : 0;

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

function select(object) {
    if (selected) {
        selected.material.emissive.setHex(
            selected.userData.baseEmissive || 0
        );
    }

    selected = object;

    if (object) {
        object.userData.baseEmissive =
            object.material.emissive.getHex();

        object.material.emissive.setHex(
            0x24384a
        );

        transform.attach(object);

        $("#selectionLabel").textContent =
            object.name;
    } else {
        transform.detach();

        $("#selectionLabel").textContent =
            "Nothing selected";
    }

    renderList();
    renderProps();
}

function deleteSelected() {
    if (!selected) return;

    const object = selected;

    select(null);

    scene.remove(object);

    object.geometry.dispose();
    object.material.dispose();

    mark();
    pushHistory();

    toast("Object deleted");
}

function focusObject(object) {
    const box = new THREE.Box3()
        .setFromObject(object);

    const center = box.getCenter(
        new THREE.Vector3()
    );

    const size = box
        .getSize(new THREE.Vector3())
        .length();

    orbit.target.copy(center);

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
}

/* =========================================================
   TRANSFORM TOOLS
========================================================= */

function setTool(type) {
    tool = type;

    transform.setMode(type);

    $$(".tool[data-tool]").forEach(
        (button) => {
            button.classList.toggle(
                "active",
                button.dataset.tool === type
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
        orbit.enabled = !event.value;
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
    const box = $("#objectList");

    box.innerHTML = "";

    scene.children
        .filter((object) => object.isMesh)
        .forEach((object) => {
            const row =
                document.createElement("div");

            row.className =
                "object-row" +
                (object === selected
                    ? " selected"
                    : "");

            row.innerHTML = `
                <span>◇</span>
                <span>${esc(object.name)}</span>
                <button class="eye">
                    ${object.visible ? "◉" : "○"}
                </button>
            `;

            row.onclick = (event) => {
                if (
                    event.target.classList.contains(
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

                select(object);
            };

            box.appendChild(row);
        });
}

/* =========================================================
   PROPERTIES PANEL
========================================================= */

function renderProps() {
    const box = $("#propertiesContent");

    if (!selected) {
        box.innerHTML = `
            <div class="empty">
                Select an object to edit its properties.
            </div>
        `;

        return;
    }

    const object = selected;
    const material = object.material;

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
                <label>Color</label>

                <input
                    id="pColor"
                    class="color"
                    type="color"
                    value="#${material.color.getHexString()}"
                >
            </div>

            <div class="prop">
                <label>Emissive</label>

                <input
                    id="pEmissive"
                    class="color"
                    type="color"
                    value="#${material.emissive.getHexString()}"
                >
            </div>

            <div class="prop">
                <label>Metalness</label>

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
                <label>Roughness</label>

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
                <label>Opacity</label>

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
                <label>Name</label>

                <input
                    id="pName"
                    type="text"
                    value="${esc(object.name)}"
                >
            </div>
        </div>
    `;

    $$(".v").forEach((input) => {
        input.addEventListener(
            "input",
            () => {
                const attribute =
                    input.dataset.a;

                const axis =
                    input.dataset.b;

                selected[attribute][axis] =
                    Number(input.value);

                mark(false);
            }
        );
    });

    $("#pColor").oninput = () => {
        material.color.set(
            $("#pColor").value
        );

        mark(false);
    };

    $("#pEmissive").oninput = () => {
        material.emissive.set(
            $("#pEmissive").value
        );

        mark(false);
    };

    $("#pMetal").oninput = () => {
        material.metalness =
            +$("#pMetal").value;

        mark(false);
    };

    $("#pRough").oninput = () => {
        material.roughness =
            +$("#pRough").value;

        mark(false);
    };

    $("#pOpacity").oninput = () => {
        material.opacity =
            +$("#pOpacity").value;

        material.transparent =
            material.opacity < 1;

        mark(false);
    };

    $("#pName").onchange = () => {
        object.name =
            $("#pName").value.trim() ||
            "Object";

        renderList();

        mark();
        pushHistory();
    };
}

function vec(
    label,
    value,
    key,
    rotation = false
) {
    return `
        <div class="prop">
            <label>${label}</label>

            <div class="triple">
                ${["x", "y", "z"]
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
                                ].toFixed(3)}"
                            >
                        `
                    )
                    .join("")}
            </div>
        </div>
    `;
}

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
            })[character]
    );
}

/* =========================================================
   SCENE DATA
========================================================= */

function sceneData() {
    return {
        version: 1,

        name: projectName,

        background:
            scene.background.getHex(),

        camera: {
            p: camera.position.toArray(),
            q: camera.quaternion.toArray(),
            target: orbit.target.toArray()
        },

        lights: {
            ambient: ambient.intensity,
            sun: sun.intensity,
            point: point.intensity
        },

        objects: scene.children
            .filter((object) => object.isMesh)
            .map((object) => ({
                name: object.name,

                primitive:
                    object.userData.primitive,

                position:
                    object.position.toArray(),

                rotation:
                    object.rotation.toArray(),

                scale:
                    object.scale.toArray(),

                visible:
                    object.visible,

                material: {
                    color:
                        object.material.color.getHex(),

                    emissive:
                        object.material.emissive.getHex(),

                    metalness:
                        object.material.metalness,

                    roughness:
                        object.material.roughness,

                    opacity:
                        object.material.opacity
                },

                animation:
                    animData.get(object) || []
            }))
    };
}

function clearObjects() {
    scene.children
        .filter((object) => object.isMesh)
        .forEach((object) => {
            object.geometry.dispose();
            object.material.dispose();

            scene.remove(object);
        });

    select(null);
}

function loadData(data) {
    if (
        !data ||
        !Array.isArray(data.objects)
    ) {
        throw Error(
            "Invalid Mini Blender JSON"
        );
    }

    clearObjects();

    projectName =
        data.name || "MyProject";

    scene.background.set(
        data.background ?? 0x101214
    );

    if (data.camera) {
        camera.position.fromArray(
            data.camera.p || [7, 5, 9]
        );

        camera.quaternion.fromArray(
            data.camera.q || [0, 0, 0, 1]
        );

        orbit.target.fromArray(
            data.camera.target || [0, 1, 0]
        );
    }

    data.objects.forEach((item) => {
        const object = new THREE.Mesh(
            geometry(
                item.primitive || "box"
            ),
            makeMat()
        );

        object.name =
            item.name || "Object";

        object.userData.primitive =
            item.primitive || "box";

        object.position.fromArray(
            item.position || [0, 0, 0]
        );

        object.rotation.fromArray(
            item.rotation || [0, 0, 0]
        );

        object.scale.fromArray(
            item.scale || [1, 1, 1]
        );

        object.visible =
            item.visible !== false;

        Object.assign(
            object.material,
            item.material || {}
        );

        object.material.color.set(
            item.material?.color ??
                0x6688aa
        );

        object.material.emissive.set(
            item.material?.emissive ?? 0
        );

        object.material.transparent =
            object.material.opacity < 1;

        scene.add(object);

        animData.set(
            object,
            item.animation || []
        );
    });

    if (data.lights) {
        ambient.intensity =
            data.lights.ambient ?? 0.55;

        sun.intensity =
            data.lights.sun ?? 1.4;

        point.intensity =
            data.lights.point ?? 25;
    }

    orbit.update();

    renderList();
    renderProps();

    dirty = false;

    updateTitle();

    $("#status").textContent =
        "Loaded";
}

/* =========================================================
   PROJECT STATE
========================================================= */

function mark(show = true) {
    dirty = true;

    updateTitle();

    $("#status").textContent =
        "Unsaved Changes";

    if (show) {
        toast("Unsaved Changes");
    }
}

function updateTitle() {
    $("#projectTitle").textContent =
        projectName +
        (dirty ? "*" : "");

    $("#dirtyDot").textContent =
        dirty ? "●" : "";

    document.title =
        projectName +
        (dirty ? "*" : "") +
        " — Mini Blender";
}

/* =========================================================
   UNDO / REDO
========================================================= */

function pushHistory() {
    if (restoring) return;

    const state =
        JSON.stringify(sceneData());

    if (history.at(-1) === state) {
        return;
    }

    history.push(state);

    if (history.length > 60) {
        history.shift();
    }

    future = [];
}

function restore(state) {
    restoring = true;

    loadData(
        JSON.parse(state)
    );

    restoring = false;
}

function undo() {
    if (history.length < 2) {
        return;
    }

    future.push(history.pop());

    restore(
        history.at(-1)
    );

    toast("Undo");
}

function redo() {
    if (!future.length) {
        return;
    }

    const state =
        future.pop();

    history.push(state);

    restore(state);

    toast("Redo");
}

/* =========================================================
   SAVE / LOAD
========================================================= */

async function save(as = false) {
    try {
        const data =
            JSON.stringify(
                sceneData(),
                null,
                2
            );

        const blob = new Blob(
            [data],
            {
                type: "application/json"
            }
        );

        $("#status").textContent =
            "Saving...";

        const name =
            projectName + ".json";

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
                                            [".json"]
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

                toast(
                    "Project saved successfully."
                );

                return;
            }
        }

        const writable =
            await saveHandle.createWritable();

        await writable.write(blob);
        await writable.close();

        dirty = false;

        updateTitle();

        $("#status").textContent =
            "Saved";

        localStorage.setItem(
            "miniBlenderRecent",
            JSON.stringify({
                name: projectName,
                data,
                time: Date.now()
            })
        );

        localStorage.setItem(
            "miniBlenderRecovery",
            data
        );

        toast(
            "Project saved successfully."
        );
    } catch (error) {
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

function downloadBlob(
    blob,
    name
) {
    const link =
        document.createElement("a");

    link.href =
        URL.createObjectURL(blob);

    link.download = name;

    link.click();

    setTimeout(
        () =>
            URL.revokeObjectURL(
                link.href
            ),
        1000
    );
}

function openProject() {
    $("#projectFile").click();
}

$("#projectFile").onchange =
    async (event) => {
        const file =
            event.target.files[0];

        if (!file) return;

        try {
            const data =
                JSON.parse(
                    await file.text()
                );

            loadData(data);

            saveHandle = null;

            history = [
                JSON.stringify(
                    sceneData()
                )
            ];

            future = [];

            toast(
                "Project loaded successfully."
            );
        } catch (error) {
            toast(
                "Failed to load project: " +
                error.message
            );
        }

        event.target.value = "";
    };

/* =========================================================
   NEW PROJECT
========================================================= */

async function newProject() {
    const createNew = async () => {
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
        saveHandle = null;

        history = [
            JSON.stringify(
                sceneData()
            )
        ];

        future = [];

        renderList();
        renderProps();
        updateTitle();

        $("#status").textContent =
            "New Project";
    };

    if (dirty) {
        dialog(
            "Unsaved Changes",

            "You have unsaved changes. Save before creating a new project?",

            [
                {
                    t: "Save",

                    c: async () => {
                        await save(true);
                        await createNew();
                    }
                },

                {
                    t: "Don't Save",
                    c: createNew
                },

                {
                    t: "Cancel"
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
    $("#dialogTitle").textContent =
        title;

    $("#dialogText").textContent =
        text;

    const actions =
        $("#dialogActions");

    actions.innerHTML = "";

    buttons.forEach(
        (button, index) => {
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

            element.onclick = () => {
                $("#dialog").classList.add(
                    "hidden"
                );

                button.c?.();
            };

            actions.appendChild(
                element
            );
        }
    );

    $("#dialog").classList.remove(
        "hidden"
    );
}

/* =========================================================
   TOAST
========================================================= */

function toast(message) {
    const element =
        $("#toast");

    element.textContent =
        message;

    element.classList.add(
        "show"
    );

    clearTimeout(toast.t);

    toast.t = setTimeout(
        () =>
            element.classList.remove(
                "show"
            ),
        2200
    );
}

/* =========================================================
   EXPORT
========================================================= */

function exportFile(kind) {
    const root =
        new THREE.Group();

    scene.children
        .filter((object) => object.isMesh)
        .forEach((object) => {
            root.add(
                object.clone()
            );
        });

    try {
        if (kind === "json") {
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

        if (kind === "png") {
            renderer.domElement.toBlob(
                (blob) =>
                    downloadBlob(
                        blob,
                        projectName +
                            ".png"
                    ),
                "image/png"
            );

            return;
        }

        if (kind === "obj") {
            downloadBlob(
                new Blob(
                    [
                        new OBJExporter()
                            .parse(root)
                    ],
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

        new GLTFExporter().parse(
            root,

            (result) => {
                const binary =
                    kind === "glb";

                downloadBlob(
                    new Blob(
                        [result],
                        {
                            type: binary
                                ? "model/gltf-binary"
                                : "model/gltf+json"
                        }
                    ),

                    projectName +
                        (binary
                            ? ".glb"
                            : ".gltf")
                );

                toast(
                    "Export completed."
                );
            },

            {
                binary:
                    kind === "glb",

                onlyVisible: false
            }
        );
    } catch (error) {
        toast(
            "Export failed: " +
            error.message
        );
    }
}

/* =========================================================
   IMPORT GLTF
========================================================= */

function importGLTF(file) {
    const url =
        URL.createObjectURL(file);

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

            select(
                gltf.scene.getObjectByProperty(
                    "isMesh",
                    true
                )
            );

            mark();
            pushHistory();

            toast(
                "Model imported."
            );
        },

        undefined,

        (error) => {
            toast(
                "Import failed: " +
                error.message
            );
        }
    );
}

/* =========================================================
   IMPORT OBJ
========================================================= */

function importOBJ(file) {
    const url =
        URL.createObjectURL(file);

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

            select(
                object.getObjectByProperty(
                    "isMesh",
                    true
                )
            );

            mark();
            pushHistory();

            toast(
                "OBJ imported."
            );
        },

        undefined,

        (error) => {
            toast(
                "Import failed: " +
                error.message
            );
        }
    );
}

/* =========================================================
   OBJECT / TOOL BUTTONS
========================================================= */

$$("[data-add]").forEach(
    (button) => {
        button.onclick = () =>
            addObject(
                button.dataset.add
            );
    }
);

$$("[data-tool]").forEach(
    (button) => {
        button.onclick = () =>
            setTool(
                button.dataset.tool
            );
    }
);

$("#addMenu").onclick = () =>
    addObject("box");

$("#moreBtn").onclick = () =>
    $("#contextMenu").classList.toggle(
        "hidden"
    );

/* =========================================================
   EXPORT BUTTONS
========================================================= */

$$("[data-export]").forEach(
    (button) => {
        button.onclick = () => {
            exportFile(
                button.dataset.export
            );

            $("#contextMenu").classList.add(
                "hidden"
            );
        };
    }
);

/* =========================================================
   IMPORT BUTTONS
========================================================= */

$$("[data-import]").forEach(
    (button) => {
        button.onclick = () => {
            $("#importFile").accept =
                button.dataset.import ===
                "obj"
                    ? ".obj"
                    : ".gltf,.glb";

            $("#importFile").click();

            $("#contextMenu").classList.add(
                "hidden"
            );
        };
    }
);

$("#importFile").onchange =
    (event) => {
        const file =
            event.target.files[0];

        if (!file) return;

        const name =
            file.name.toLowerCase();

        if (
            name.endsWith(".json")
        ) {
            file.text().then(
                (text) => {
                    try {
                        loadData(
                            JSON.parse(
                                text
                            )
                        );

                        toast(
                            "Scene imported."
                        );
                    } catch {
                        toast(
                            "Failed to load project."
                        );
                    }
                }
            );
        } else if (
            name.endsWith(".obj")
        ) {
            importOBJ(file);
        } else {
            importGLTF(file);
        }

        event.target.value = "";
    };

/* =========================================================
   PROJECT ACTIONS
========================================================= */

$$("[data-action]").forEach(
    (button) => {
        button.onclick = () => {
            const actions = {
                new: newProject,
                open: openProject,
                save: () => save(false),
                saveAs: () => save(true),
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
   TIMELINE
========================================================= */

$("#play").onclick = () => {
    playing = true;
};

$("#pause").onclick = () => {
    playing = false;
};

$("#stop").onclick = () => {
    playing = false;

    frame = 1;

    $("#frameInput").value = 1;
};

$("#frameInput").onchange =
    (event) => {
        frame = Math.max(
            1,
            Math.min(
                240,
                +event.target.value || 1
            )
        );

        applyAnimation();
    };

$("#keyframe").onclick = () => {
    if (!selected) return;

    const frames =
        animData.get(selected) || [];

    frames.push({
        frame,

        position:
            selected.position.toArray(),

        rotation:
            selected.rotation.toArray(),

        scale:
            selected.scale.toArray()
    });

    animData.set(
        selected,
        frames.sort(
            (a, b) =>
                a.frame - b.frame
        )
    );

    mark();
    pushHistory();

    toast(
        "Keyframe added."
    );
};

for (
    let i = 1;
    i <= 240;
    i += 10
) {
    const span =
        document.createElement(
            "span"
        );

    span.textContent = i;

    $("#ruler").appendChild(
        span
    );
}

function applyAnimation() {
    if (!selected) return;

    const animation =
        animData.get(selected) || [];

    if (animation.length < 1) {
        return;
    }

    let previous =
        animation[0];

    let next =
        animation[
            animation.length - 1
        ];

    for (const keyframe of animation) {
        if (
            keyframe.frame <= frame
        ) {
            previous =
                keyframe;
        }

        if (
            keyframe.frame >= frame
        ) {
            next =
                keyframe;

            break;
        }
    }

    const t =
        previous === next
            ? 0
            : (
                frame -
                previous.frame
            ) /
              (
                next.frame -
                previous.frame
              );

    selected.position
        .fromArray(
            previous.position
        )
        .lerp(
            new THREE.Vector3()
                .fromArray(
                    next.position
                ),
            t
        );

    selected.rotation.set(
        ...previous.rotation
    );

    selected.scale
        .fromArray(
            previous.scale
        )
        .lerp(
            new THREE.Vector3()
                .fromArray(
                    next.scale
                ),
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
        if (
            (event.ctrlKey ||
                event.metaKey) &&
            event.key.toLowerCase() ===
                "s"
        ) {
            event.preventDefault();

            save(event.shiftKey);

            return;
        }

        if (
            (event.ctrlKey ||
                event.metaKey) &&
            event.key.toLowerCase() ===
                "o"
        ) {
            event.preventDefault();

            openProject();

            return;
        }

        if (
            (event.ctrlKey ||
                event.metaKey) &&
            event.key.toLowerCase() ===
                "n"
        ) {
            event.preventDefault();

            newProject();

            return;
        }

        if (
            (event.ctrlKey ||
                event.metaKey) &&
            event.key.toLowerCase() ===
                "z"
        ) {
            event.preventDefault();

            if (event.shiftKey) {
                redo();
            } else {
                undo();
            }

            return;
        }

        if (
            (event.ctrlKey ||
                event.metaKey) &&
            (
                event.key.toLowerCase() ===
                    "y" ||
                (
                    event.key.toLowerCase() ===
                        "z" &&
                    event.shiftKey
                )
            )
        ) {
            event.preventDefault();

            redo();

            return;
        }

        if (
            event.target.matches(
                "input"
            )
        ) {
            return;
        }

        const key =
            event.key.toLowerCase();

        if (key === "g") {
            setTool("translate");
        }

        if (key === "r") {
            setTool("rotate");
        }

        if (key === "s") {
            setTool("scale");
        }

        if (
            key === "f" &&
            selected
        ) {
            focusObject(selected);
        }

        if (
            event.key ===
            "Delete"
        ) {
            deleteSelected();
        }
    }
);

/* =========================================================
   VIEWPORT SELECTION
========================================================= */

renderer.domElement.addEventListener(
    "pointerdown",
    (event) => {
        const rect =
            renderer.domElement.getBoundingClientRect();

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
                    event.clientY -
                    rect.top
                ) /
                rect.height
            ) *
                2 +
            1;

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

        if (hits[0]) {
            let object =
                hits[0].object;

            while (
                object.parent &&
                !object.isMesh
            ) {
                object =
                    object.parent;
            }

            select(object);
        } else {
            select(null);
        }
    }
);

/* =========================================================
   MAIN RENDER LOOP
========================================================= */

let last =
    performance.now();

function loop(now) {
    requestAnimationFrame(loop);

    const delta =
        now - last;

    last = now;

    if (playing) {
        frame++;

        if (frame > 240) {
            frame = 1;
        }

        $("#frameInput").value =
            frame;

        $("#playhead").style.left =
            (
                (frame - 1) /
                240 *
                100
            ) + "%";

        applyAnimation();
    }

    orbit.update();

    renderer.render(
        scene,
        camera
    );
}

requestAnimationFrame(loop);

/* =========================================================
   AUTOSAVE / RECOVERY
========================================================= */

setInterval(
    () => {
        if (dirty) {
            localStorage.setItem(
                "miniBlenderRecovery",

                JSON.stringify(
                    sceneData()
                )
            );
        }
    },
    120000
);

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
                t: "Recover",

                c: () => {
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
                t: "Discard",

                c: () =>
                    localStorage.removeItem(
                        "miniBlenderRecovery"
                    )
            }
        ]
    );
}

/* =========================================================
   INITIALIZE EDITOR
========================================================= */

history = [
    JSON.stringify(
        sceneData()
    )
];

renderList();
renderProps();
updateTitle();
