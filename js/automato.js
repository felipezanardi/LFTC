(function () {
  const engine = window.automatonEngine;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const VIEWBOX_W = 880;
  const VIEWBOX_H = 340;
  const STATE_RADIUS = 24;

  // Estado da aplicacao
  const app = {
    mode: "AFD",
    tool: "select",
    states: [],
    transitions: [],
    nextStateNum: 0,
    nextTransitionNum: 1,
    selected: null, // { type: "state" | "transition", id: string }
    pendingSourceId: null,
    drag: null, // { id, offsetX, offsetY, moved }
    pan: { x: 0, y: 0 },
    panDrag: null, // { startX, startY, origPanX, origPanY, moved }
    ignoreNextBgClick: false,
    sim: {
      steps: [],
      currentStep: 0,
      error: null,
    },
  };

  // Referencias do DOM
  const svg = document.getElementById("automatonSvg");
  const gridBg = document.getElementById("gridBg");
  const dotGrid = document.getElementById("dotGrid");
  const viewportLayer = document.getElementById("viewportLayer");
  const transitionsLayer = document.getElementById("transitionsLayer");
  const statesLayer = document.getElementById("statesLayer");
  const validationBanner = document.getElementById("validationBanner");
  const canvasHint = document.getElementById("canvasHint");

  const modeButtons = document.querySelectorAll(".mode-btn");
  const toolButtons = document.querySelectorAll(".tool-btn");
  const presetSelect = document.getElementById("presetSelect");
  const btnClear = document.getElementById("btnClear");

  const inspectorPanel = document.getElementById("inspectorPanel");
  const stateInspector = document.getElementById("stateInspector");
  const transitionInspector = document.getElementById("transitionInspector");
  const stateLabelInput = document.getElementById("stateLabelInput");
  const stateInitialCheck = document.getElementById("stateInitialCheck");
  const stateFinalCheck = document.getElementById("stateFinalCheck");
  const btnDeleteState = document.getElementById("btnDeleteState");

  const transitionEndpoints = document.getElementById("transitionEndpoints");
  const transitionSymbolsInput = document.getElementById("transitionSymbolsInput");
  const btnInsertEpsilon = document.getElementById("btnInsertEpsilon");
  const btnDeleteTransition = document.getElementById("btnDeleteTransition");

  const singleWordInput = document.getElementById("singleWordInput");
  const tapeDisplay = document.getElementById("tapeDisplay");
  const btnStepReset = document.getElementById("btnStepReset");
  const btnStepPrev = document.getElementById("btnStepPrev");
  const btnStepNext = document.getElementById("btnStepNext");
  const btnStepAll = document.getElementById("btnStepAll");
  const simStatus = document.getElementById("simStatus");

  const batchList = document.getElementById("batchList");
  const btnAddBatch = document.getElementById("btnAddBatch");

  function createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
  }

  function getSvgPoint(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * VIEWBOX_W,
      y: ((clientY - rect.top) / rect.height) * VIEWBOX_H,
    };
  }

  function getWorldPoint(clientX, clientY) {
    const pt = getSvgPoint(clientX, clientY);
    return {
      x: pt.x - app.pan.x,
      y: pt.y - app.pan.y,
    };
  }

  function applyPanTransform() {
    const tx = Math.round(app.pan.x);
    const ty = Math.round(app.pan.y);
    viewportLayer.setAttribute("transform", `translate(${tx}, ${ty})`);
    if (dotGrid) {
      dotGrid.setAttribute("patternTransform", `translate(${tx}, ${ty})`);
    }
  }

  function isBackgroundTarget(target) {
    return target === svg || target === gridBg;
  }

  function getStateById(id) {
    return app.states.find((s) => s.id === id);
  }

  function getTransitionById(id) {
    return app.transitions.find((t) => t.id === id);
  }

  function nextAvailableStateLabel() {
    const used = new Set(app.states.map((s) => s.label));
    while (used.has(`q${app.nextStateNum}`)) {
      app.nextStateNum++;
    }
    return `q${app.nextStateNum++}`;
  }

  function addState(x, y) {
    const label = nextAvailableStateLabel();
    const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const isInitial = app.states.length === 0;
    app.states.push({
      id,
      label,
      x: Math.round(x),
      y: Math.round(y),
      isInitial,
      isFinal: false,
    });
    app.selected = { type: "state", id };
    onModelChanged();
  }

  function removeState(stateId) {
    app.states = app.states.filter((s) => s.id !== stateId);
    app.transitions = app.transitions.filter(
      (t) => t.from !== stateId && t.to !== stateId
    );
    if (app.selected && app.selected.id === stateId) {
      app.selected = null;
    }
    if (app.pendingSourceId === stateId) {
      app.pendingSourceId = null;
    }
    onModelChanged();
  }

  function addOrSelectTransition(fromId, toId) {
    const existing = app.transitions.find(
      (t) => t.from === fromId && t.to === toId
    );
    if (existing) {
      app.selected = { type: "transition", id: existing.id };
      renderAll();
      transitionSymbolsInput.focus();
      return;
    }

    const id = `t_${app.nextTransitionNum++}`;
    app.transitions.push({
      id,
      from: fromId,
      to: toId,
      symbols: ["a"],
    });
    app.selected = { type: "transition", id };
    onModelChanged();
    transitionSymbolsInput.focus();
    transitionSymbolsInput.select();
  }

  function removeTransition(transitionId) {
    app.transitions = app.transitions.filter((t) => t.id !== transitionId);
    if (app.selected && app.selected.id === transitionId) {
      app.selected = null;
    }
    onModelChanged();
  }

  function setMode(mode) {
    app.mode = mode;
    modeButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    btnInsertEpsilon.disabled = mode === "AFD";
    onModelChanged();
  }

  function setTool(tool) {
    app.tool = tool;
    app.pendingSourceId = null;
    toolButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === tool);
    });

    svg.classList.toggle("tool-add", tool === "add-state");

    const hints = {
      select:
        "Arraste um estado para movê-lo ou arraste o fundo para deslocar o diagrama. Duplo clique no vazio cria um estado.",
      "add-state": "Clique em qualquer ponto do diagrama para adicionar um novo estado.",
      "add-transition":
        "Clique no estado de origem e depois no estado de destino (ou no mesmo estado para criar um laço).",
      delete: "Clique em qualquer estado ou transição para removê-lo.",
    };
    canvasHint.textContent = hints[tool] || "";
    renderDiagram();
  }

  // Geometria das setas
  function computeTransitionGeometry(t, hasReverse) {
    const fromState = getStateById(t.from);
    const toState = getStateById(t.to);
    if (!fromState || !toState) return null;

    if (t.from === t.to) {
      const { x, y } = fromState;
      const sx = x - 11;
      const sy = y - STATE_RADIUS + 3;
      const ex = x + 11;
      const ey = y - STATE_RADIUS + 3;
      const d = `M ${sx} ${sy} C ${x - 36} ${y - 78}, ${x + 36} ${y - 78}, ${ex} ${ey}`;
      return {
        d,
        labelX: x,
        labelY: y - 68,
      };
    }

    const dx = toState.x - fromState.x;
    const dy = toState.y - fromState.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    // Normal perpendicular
    const nx = -uy;
    const ny = ux;

    if (!hasReverse) {
      const sx = fromState.x + ux * STATE_RADIUS;
      const sy = fromState.y + uy * STATE_RADIUS;
      const ex = toState.x - ux * (STATE_RADIUS + 3);
      const ey = toState.y - uy * (STATE_RADIUS + 3);
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      return {
        d: `M ${sx} ${sy} L ${ex} ${ey}`,
        labelX: mx + nx * 13,
        labelY: my + ny * 13,
      };
    }

    // Curva quadratica para separar transicoes nos dois sentidos
    const curveOffset = 34;
    const mx = (fromState.x + toState.x) / 2;
    const my = (fromState.y + toState.y) / 2;
    const cx = mx + nx * curveOffset;
    const cy = my + ny * curveOffset;

    const sDx = cx - fromState.x;
    const sDy = cy - fromState.y;
    const sDist = Math.hypot(sDx, sDy) || 1;
    const sx = fromState.x + (sDx / sDist) * STATE_RADIUS;
    const sy = fromState.y + (sDy / sDist) * STATE_RADIUS;

    const eDx = toState.x - cx;
    const eDy = toState.y - cy;
    const eDist = Math.hypot(eDx, eDy) || 1;
    const ex = toState.x - (eDx / eDist) * (STATE_RADIUS + 3);
    const ey = toState.y - (eDy / eDist) * (STATE_RADIUS + 3);

    const labelX = 0.25 * sx + 0.5 * cx + 0.25 * ex + nx * 10;
    const labelY = 0.25 * sy + 0.5 * cy + 0.25 * ey + ny * 10;

    return {
      d: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`,
      labelX,
      labelY,
    };
  }

  function renderDiagram() {
    transitionsLayer.innerHTML = "";
    statesLayer.innerHTML = "";

    const currentStepObj =
      app.sim.steps.length > 0 ? app.sim.steps[app.sim.currentStep] : null;
    const activeStateIds = new Set(
      currentStepObj ? currentStepObj.activeStates : []
    );
    const activeTransitionIds = new Set(
      currentStepObj ? currentStepObj.activeTransitions : []
    );

    // Desenhar transicoes
    app.transitions.forEach((t) => {
      const hasReverse = app.transitions.some(
        (other) => other.from === t.to && other.to === t.from && other.id !== t.id
      );
      const geom = computeTransitionGeometry(t, hasReverse);
      if (!geom) return;

      const isSelected =
        app.selected && app.selected.type === "transition" && app.selected.id === t.id;
      const isActive = activeTransitionIds.has(t.id);

      const group = createSvgElement("g", {
        class: [
          "svg-transition-group",
          isSelected ? "selected" : "",
          isActive ? "active-sim" : "",
        ]
          .filter(Boolean)
          .join(" "),
        "data-id": t.id,
      });

      const marker = isActive
        ? "url(#arrow-active)"
        : isSelected
          ? "url(#arrow-selected)"
          : "url(#arrow)";

      const hitPath = createSvgElement("path", {
        d: geom.d,
        class: "svg-transition-hit",
      });

      const visiblePath = createSvgElement("path", {
        d: geom.d,
        class: "svg-transition-path",
        "marker-end": marker,
      });

      const labelText = t.symbols.length > 0 ? t.symbols.join(", ") : "?";
      const approxWidth = Math.max(18, labelText.length * 8 + 8);
      const labelBg = createSvgElement("rect", {
        x: geom.labelX - approxWidth / 2,
        y: geom.labelY - 10,
        width: approxWidth,
        height: 20,
        rx: 4,
        class: "svg-transition-label-bg",
      });

      const label = createSvgElement("text", {
        x: geom.labelX,
        y: geom.labelY,
        class: "svg-transition-label",
      });
      label.textContent = labelText;

      const onTransitionClick = (e) => {
        e.stopPropagation();
        if (app.tool === "delete") {
          removeTransition(t.id);
          return;
        }
        app.selected = { type: "transition", id: t.id };
        renderDiagram();
        renderInspector();
      };

      hitPath.addEventListener("click", onTransitionClick);
      label.addEventListener("click", onTransitionClick);

      group.appendChild(hitPath);
      group.appendChild(visiblePath);
      group.appendChild(labelBg);
      group.appendChild(label);
      transitionsLayer.appendChild(group);
    });

    // Desenhar estados
    app.states.forEach((s) => {
      const isSelected =
        app.selected && app.selected.type === "state" && app.selected.id === s.id;
      const isActive = activeStateIds.has(s.id);
      const isPending = app.pendingSourceId === s.id;

      const group = createSvgElement("g", {
        class: [
          "svg-state",
          isSelected ? "selected" : "",
          isActive ? "active-sim" : "",
          isPending ? "pending-source" : "",
        ]
          .filter(Boolean)
          .join(" "),
        "data-id": s.id,
      });

      if (s.isInitial) {
        const initArrow = createSvgElement("path", {
          d: `M ${s.x - STATE_RADIUS - 24} ${s.y} L ${s.x - STATE_RADIUS - 3} ${s.y}`,
          class: "svg-initial-arrow",
          "marker-end": "url(#arrow)",
        });
        group.appendChild(initArrow);
      }

      const circle = createSvgElement("circle", {
        cx: s.x,
        cy: s.y,
        r: STATE_RADIUS,
        class: "svg-state-circle",
      });
      group.appendChild(circle);

      if (s.isFinal) {
        const innerCircle = createSvgElement("circle", {
          cx: s.x,
          cy: s.y,
          r: STATE_RADIUS - 5,
          class: "svg-state-final",
        });
        group.appendChild(innerCircle);
      }

      const text = createSvgElement("text", {
        x: s.x,
        y: s.y,
        class: "svg-state-label",
      });
      text.textContent = s.label;
      group.appendChild(text);

      group.addEventListener("pointerdown", (e) => {
        e.stopPropagation();

        if (app.tool === "delete") {
          removeState(s.id);
          return;
        }

        if (app.tool === "add-transition") {
          if (!app.pendingSourceId) {
            app.pendingSourceId = s.id;
            renderDiagram();
          } else {
            const fromId = app.pendingSourceId;
            app.pendingSourceId = null;
            addOrSelectTransition(fromId, s.id);
          }
          return;
        }

        // Modo select: iniciar arraste
        const pt = getWorldPoint(e.clientX, e.clientY);
        app.drag = {
          id: s.id,
          offsetX: s.x - pt.x,
          offsetY: s.y - pt.y,
          moved: false,
        };
        svg.setPointerCapture(e.pointerId);
      });

      statesLayer.appendChild(group);
    });
  }

  function renderInspector() {
    if (!app.selected) {
      inspectorPanel.hidden = true;
      stateInspector.hidden = true;
      transitionInspector.hidden = true;
      return;
    }

    if (app.selected.type === "state") {
      const state = getStateById(app.selected.id);
      if (!state) {
        app.selected = null;
        renderInspector();
        return;
      }
      inspectorPanel.hidden = false;
      stateInspector.hidden = false;
      transitionInspector.hidden = true;
      stateLabelInput.value = state.label;
      stateInitialCheck.checked = state.isInitial;
      stateFinalCheck.checked = state.isFinal;
      return;
    }

    if (app.selected.type === "transition") {
      const t = getTransitionById(app.selected.id);
      if (!t) {
        app.selected = null;
        renderInspector();
        return;
      }
      const fromState = getStateById(t.from);
      const toState = getStateById(t.to);
      inspectorPanel.hidden = false;
      stateInspector.hidden = true;
      transitionInspector.hidden = false;
      transitionEndpoints.textContent = `${fromState ? fromState.label : "?"} → ${
        toState ? toState.label : "?"
      }`;
      transitionSymbolsInput.value = t.symbols.join(", ");
      btnInsertEpsilon.disabled = app.mode === "AFD";
    }
  }

  function renderValidation() {
    const res = engine.validateAutomaton(
      { states: app.states, transitions: app.transitions },
      app.mode
    );
    if (res.valid) {
      validationBanner.hidden = true;
      validationBanner.textContent = "";
    } else {
      validationBanner.hidden = false;
      validationBanner.textContent = res.errors.join(" ");
    }
    return res;
  }

  function recalculateSimulation() {
    const validation = renderValidation();
    if (!validation.valid) {
      app.sim = {
        steps: [],
        currentStep: 0,
        error: validation.errors[0],
      };
      renderSimulationUI();
      return;
    }

    const sim = engine.simulateSteps(
      { states: app.states, transitions: app.transitions },
      singleWordInput.value
    );
    app.sim = {
      steps: sim.steps,
      currentStep: 0,
      error: sim.error,
    };
    renderSimulationUI();
  }

  function renderSimulationUI() {
    const steps = app.sim.steps;
    const step = steps[app.sim.currentStep] || null;
    const word = singleWordInput.value;

    // Fita de entrada
    tapeDisplay.innerHTML = "";
    if (!word) {
      const emptySpan = document.createElement("span");
      emptySpan.className = "tape-empty";
      emptySpan.textContent = "Palavra vazia (ε)";
      tapeDisplay.appendChild(emptySpan);
    } else {
      const consumedLen = step ? step.consumed.length : 0;
      for (let i = 0; i < word.length; i++) {
        const cell = document.createElement("span");
        cell.className = "tape-cell";
        if (i < consumedLen) {
          cell.classList.add("consumed");
        } else if (i === consumedLen && step && !step.isLast) {
          cell.classList.add("current");
        }
        cell.textContent = word[i];
        tapeDisplay.appendChild(cell);
      }
    }

    // Controles
    const hasSteps = steps.length > 0;
    btnStepReset.disabled = !hasSteps || app.sim.currentStep === 0;
    btnStepPrev.disabled = !hasSteps || app.sim.currentStep === 0;
    btnStepNext.disabled = !hasSteps || app.sim.currentStep >= steps.length - 1;
    btnStepAll.disabled = !hasSteps || app.sim.currentStep >= steps.length - 1;

    // Status
    simStatus.innerHTML = "";
    if (app.sim.error || !step) {
      const msg = document.createElement("span");
      msg.textContent = app.sim.error || "Configure o autômato para simular.";
      simStatus.appendChild(msg);
      renderDiagram();
      return;
    }

    const activeLabels = step.activeStates.map((id) => {
      const st = getStateById(id);
      return st ? st.label : id;
    });

    const info = document.createElement("span");
    info.textContent = `Passo ${step.stepIndex}/${steps.length - 1} | Ativos: {${
      activeLabels.length > 0 ? activeLabels.join(", ") : "∅"
    }}`;
    simStatus.appendChild(info);

    const badge = document.createElement("span");
    badge.className = "status-badge";
    if (step.isLast) {
      badge.classList.add(step.accepted ? "accepted" : "rejected");
      badge.textContent = step.accepted ? "Aceita" : "Rejeita";
    } else {
      badge.classList.add("running");
      badge.textContent = "Em andamento";
    }
    simStatus.appendChild(badge);

    renderDiagram();
  }

  function evaluateAllBatchInputs() {
    const rows = batchList.querySelectorAll(".batch-row");
    const automaton = { states: app.states, transitions: app.transitions };

    rows.forEach((row) => {
      const input = row.querySelector(".test-input");
      if (!input) return;
      const res = engine.evaluateWord(automaton, input.value, app.mode);
      if (!res.valid) {
        input.classList.remove("valid", "invalid");
        return;
      }
      input.classList.toggle("valid", res.accepted);
      input.classList.toggle("invalid", !res.accepted);
    });
  }

  function addBatchRow(initialValue = "") {
    const row = document.createElement("div");
    row.className = "batch-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "test-input";
    input.value = initialValue;
    input.placeholder = "Palavra de teste (vazio = ε)";
    input.addEventListener("input", evaluateAllBatchInputs);

    const btnSim = document.createElement("button");
    btnSim.type = "button";
    btnSim.className = "btn-small";
    btnSim.textContent = "Simular";
    btnSim.title = "Carregar esta entrada na simulação passo a passo";
    btnSim.addEventListener("click", () => {
      singleWordInput.value = input.value;
      recalculateSimulation();
    });

    const btnRemove = document.createElement("button");
    btnRemove.type = "button";
    btnRemove.className = "btn-remove";
    btnRemove.innerHTML = "&times;";
    btnRemove.title = "Remover entrada";
    btnRemove.addEventListener("click", () => {
      row.remove();
      evaluateAllBatchInputs();
    });

    row.appendChild(input);
    row.appendChild(btnSim);
    row.appendChild(btnRemove);
    batchList.appendChild(row);
    evaluateAllBatchInputs();
  }

  function renderAll() {
    renderDiagram();
    renderInspector();
    renderSimulationUI();
    evaluateAllBatchInputs();
  }

  function onModelChanged() {
    recalculateSimulation();
    renderInspector();
    evaluateAllBatchInputs();
  }

  function loadPreset(presetKey) {
    const presets = engine.getPresetExamples();
    const preset = presets[presetKey];
    if (!preset) return;

    app.states = preset.states.map((s) => ({ ...s }));
    app.transitions = preset.transitions.map((t) => ({
      ...t,
      symbols: [...t.symbols],
    }));
    app.selected = null;
    app.pendingSourceId = null;
    app.pan = { x: 0, y: 0 };
    applyPanTransform();
    app.nextStateNum = app.states.length;
    app.nextTransitionNum = app.transitions.length + 1;

    singleWordInput.value = preset.sampleWord;
    batchList.innerHTML = "";
    preset.batchWords.forEach((w) => addBatchRow(w));

    setMode(preset.mode);
  }

  // Eventos do SVG
  svg.addEventListener("pointerdown", (e) => {
    if (!isBackgroundTarget(e.target)) return;
    if (app.tool !== "select") return;

    const pt = getSvgPoint(e.clientX, e.clientY);
    app.panDrag = {
      startX: pt.x,
      startY: pt.y,
      origPanX: app.pan.x,
      origPanY: app.pan.y,
      moved: false,
    };
    svg.classList.add("panning");
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener("pointermove", (e) => {
    if (app.panDrag) {
      const pt = getSvgPoint(e.clientX, e.clientY);
      const dx = pt.x - app.panDrag.startX;
      const dy = pt.y - app.panDrag.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        app.panDrag.moved = true;
      }
      app.pan.x = app.panDrag.origPanX + dx;
      app.pan.y = app.panDrag.origPanY + dy;
      applyPanTransform();
      return;
    }

    if (!app.drag) return;
    const pt = getWorldPoint(e.clientX, e.clientY);
    const state = getStateById(app.drag.id);
    if (!state) return;

    const nx = Math.round(pt.x + app.drag.offsetX);
    const ny = Math.round(pt.y + app.drag.offsetY);

    if (Math.abs(nx - state.x) > 2 || Math.abs(ny - state.y) > 2) {
      app.drag.moved = true;
    }

    state.x = nx;
    state.y = ny;
    renderDiagram();
  });

  svg.addEventListener("pointerup", (e) => {
    if (app.panDrag) {
      if (app.panDrag.moved) {
        app.ignoreNextBgClick = true;
      }
      app.panDrag = null;
      svg.classList.remove("panning");
      if (svg.hasPointerCapture(e.pointerId)) {
        svg.releasePointerCapture(e.pointerId);
      }
      return;
    }

    if (!app.drag) return;
    const { id, moved } = app.drag;
    app.drag = null;
    if (svg.hasPointerCapture(e.pointerId)) {
      svg.releasePointerCapture(e.pointerId);
    }

    if (!moved) {
      app.selected = { type: "state", id };
      renderDiagram();
      renderInspector();
    }
  });

  svg.addEventListener("click", (e) => {
    if (!isBackgroundTarget(e.target)) return;
    if (app.ignoreNextBgClick) {
      app.ignoreNextBgClick = false;
      return;
    }
    if (app.tool === "add-state") {
      const pt = getWorldPoint(e.clientX, e.clientY);
      addState(pt.x, pt.y);
      return;
    }
    app.pendingSourceId = null;
    app.selected = null;
    renderDiagram();
    renderInspector();
  });

  svg.addEventListener("dblclick", (e) => {
    if (!isBackgroundTarget(e.target)) return;
    if (app.tool === "select") {
      const pt = getWorldPoint(e.clientX, e.clientY);
      addState(pt.x, pt.y);
    }
  });

  // Eventos da barra de ferramentas
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  toolButtons.forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });

  presetSelect.addEventListener("change", () => {
    if (presetSelect.value) {
      loadPreset(presetSelect.value);
      presetSelect.value = "";
    }
  });

  btnClear.addEventListener("click", () => {
    app.states = [];
    app.transitions = [];
    app.selected = null;
    app.pendingSourceId = null;
    app.pan = { x: 0, y: 0 };
    applyPanTransform();
    app.nextStateNum = 0;
    app.nextTransitionNum = 1;
    onModelChanged();
  });

  // Eventos do Inspector
  stateLabelInput.addEventListener("input", () => {
    if (!app.selected || app.selected.type !== "state") return;
    const state = getStateById(app.selected.id);
    if (!state) return;
    state.label = stateLabelInput.value.trim() || state.label;
    renderDiagram();
    renderSimulationUI();
  });

  stateInitialCheck.addEventListener("change", () => {
    if (!app.selected || app.selected.type !== "state") return;
    const checked = stateInitialCheck.checked;
    app.states.forEach((s) => {
      if (s.id === app.selected.id) {
        s.isInitial = checked;
      } else if (checked) {
        s.isInitial = false;
      }
    });
    onModelChanged();
  });

  stateFinalCheck.addEventListener("change", () => {
    if (!app.selected || app.selected.type !== "state") return;
    const state = getStateById(app.selected.id);
    if (!state) return;
    state.isFinal = stateFinalCheck.checked;
    onModelChanged();
  });

  btnDeleteState.addEventListener("click", () => {
    if (app.selected && app.selected.type === "state") {
      removeState(app.selected.id);
    }
  });

  transitionSymbolsInput.addEventListener("input", () => {
    if (!app.selected || app.selected.type !== "transition") return;
    const t = getTransitionById(app.selected.id);
    if (!t) return;
    t.symbols = engine.parseSymbolsInput(transitionSymbolsInput.value);
    recalculateSimulation();
    evaluateAllBatchInputs();
  });

  btnInsertEpsilon.addEventListener("click", () => {
    if (!app.selected || app.selected.type !== "transition") return;
    const t = getTransitionById(app.selected.id);
    if (!t) return;
    if (!t.symbols.includes(engine.EPSILON)) {
      t.symbols.push(engine.EPSILON);
      transitionSymbolsInput.value = t.symbols.join(", ");
      onModelChanged();
    }
  });

  btnDeleteTransition.addEventListener("click", () => {
    if (app.selected && app.selected.type === "transition") {
      removeTransition(app.selected.id);
    }
  });

  // Eventos da simulacao passo a passo
  singleWordInput.addEventListener("input", recalculateSimulation);

  btnStepReset.addEventListener("click", () => {
    app.sim.currentStep = 0;
    renderSimulationUI();
  });

  btnStepPrev.addEventListener("click", () => {
    if (app.sim.currentStep > 0) {
      app.sim.currentStep--;
      renderSimulationUI();
    }
  });

  btnStepNext.addEventListener("click", () => {
    if (app.sim.currentStep < app.sim.steps.length - 1) {
      app.sim.currentStep++;
      renderSimulationUI();
    }
  });

  btnStepAll.addEventListener("click", () => {
    if (app.sim.steps.length > 0) {
      app.sim.currentStep = app.sim.steps.length - 1;
      renderSimulationUI();
    }
  });

  btnAddBatch.addEventListener("click", () => addBatchRow(""));

  // Atalho Delete para remover item selecionado
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Delete") return;
    const tag = document.activeElement ? document.activeElement.tagName : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (!app.selected) return;

    if (app.selected.type === "state") {
      removeState(app.selected.id);
    } else if (app.selected.type === "transition") {
      removeTransition(app.selected.id);
    }
  });

  // Inicializacao com exemplo padrao
  loadPreset("afd_ab");
  setTool("select");
})();
