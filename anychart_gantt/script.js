// ============================================================================
// 1. GLOBAL STATE & CONSTANTS
// ============================================================================

let chartInstance = null;       // Gantt chart instance
let treeData = null;            // Gantt AnyChart tree data
let pertChartInstance = null;   // PERT chart instance

let selectedRowId = null;       // Currently selected Gantt row ID
let selectedItemRef = null;     // Reference to the selected AnyChart data item
let flatData = [];              // Original array-based Gantt data
let dataGridInstance = null;    // Reference to Gantt dataGrid instance

// Single endpoint that saves the entire updated Gantt JSON on server
const API_SAVE_URL = "/api/gantt/save";
const API_update_URL = "/api/gantt/task/update";
const API_ADD_CHILD_URL="/api/gantt/task/add";
const API_DATA_URL="/api/gantt/data";
// Mapping of checkbox IDs to physical column positions in the AnyChart dataGrid
const COLUMN_MAP = {
  "col-title": 1,
  "col-relation": 2,
  "col-duration": 3,
  "col-base-start": 4,
  "col-base-end": 5,
  "col-start": 6,
  "col-end": 7,
  "col-progress": 8,
  "col-status": 9,
  "col-assignee": 10
};

// Logical order of re-orderable columns (excluding the fixed title column)
let logicalColumnOrder = [
  // "col-title",  // Title column is fixed at position 1 in the grid
  "col-relation",
  "col-duration",
  "col-base-start",
  "col-base-end",
  "col-start",
  "col-end",
  "col-progress",
  "col-status",
  "col-assignee"
];
// ============================================================================
// TOAST HELPER – replaces window.showToast for non-blocking notifications
// ============================================================================

function showToast(message, type = "info") {
  // type: "info" | "success" | "warning" | "error"
  const toast = document.createElement("div");
  toast.className = `nc-toast nc-toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  // Trigger CSS transition
  requestAnimationFrame(() => {
    toast.classList.add("nc-toast-visible");
  });

  // Auto-hide after 3 seconds
  setTimeout(() => {
    toast.classList.remove("nc-toast-visible");
    setTimeout(() => toast.remove(), 300); // wait for fade-out
  }, 3000);
}

// Column configuration map: defines titles, widths, and label formats
const COLUMN_CONFIG = {
  "col-title": {
    title: "Task Details",
    configure: (col) => {
      styleColumnTitle(col, "Task Details");
      styleColumnLabels(col);
      col.width(250);
      col.labels().useHtml(true);
      col.collapseExpandButtons(true);
      col.depthPaddingMultiplier(20);
      col.labels().format(function () {
        const item = this.item;
        const name = item && item.get ? item.get("name") : "(Unnamed)";
        const safeName = String(name).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const isParent = item && item.numChildren && item.numChildren() > 0;
        const style = isParent
          ? "font-weight:600; color:#0d47a1;font-family: Inter, Helvetica, Arial, sans-serif"
          : "font-weight:400; color:#374151;font-family: Inter, Helvetica, Arial, sans-serif";
        return `<span style="${style}">${safeName}</span>`;
      });
    }
  },

  "col-relation": {
    title: "Relation",
    configure: (col) => {
      styleColumnTitle(col, "Relation");
      styleColumnLabels(col);
      col.width(80);
      //col.labels().format("{%relation}");
      col.labels().format("finish-start");
    }
  },

  // "col-duration": {
  //   title: "Duration",
  //   configure: (col) => {
  //     styleColumnTitle(col, "Duration");
  //     styleColumnLabels(col);
  //     col.width(90);
  //     col.labels().format("{%duration}");
  //   }
  // },
  "col-duration": {
  title: "Duration",
  configure: (col) => {
    styleColumnTitle(col, "Duration");
    styleColumnLabels(col);
    col.width(90);

    col.labels().format(function () {
      const duration = this.item.get("duration");

      if (!duration || typeof duration !== "object") {
        return "";
      }

      const value = duration.m_duration;
      const unit  = duration.m_units;

      if (value == null || !unit) return "";

      return `${value} ${unit.toLowerCase()}`; // → "3 days"
    });
  }
},


  "col-base-start": {
    title: "Baseline Start Date",
    configure: (col) => {
      styleColumnTitle(col, "Baseline Start Date");
      styleColumnLabels(col);
      col.width(110);
      //col.labels().format("{%baselineStartDate}{dateTimeFormat:dd MMM yyyy}");
       col.labels().format("{%actualStart}{dateTimeFormat:dd MMM yyyy}");
    }
  },

  "col-base-end": {
    title: "Baseline End Date",
    configure: (col) => {
      styleColumnTitle(col, "Baseline End Date");
      styleColumnLabels(col);
      col.width(110);
      //col.labels().format("{%baselineEndDate}{dateTimeFormat:dd MMM yyyy}");
      col.labels().format("{%actualEnd}{dateTimeFormat:dd MMM yyyy}");
    }
  },

  "col-start": {
    title: "Actual Start Date",
    configure: (col) => {
      styleColumnTitle(col, "Actual Start Date");
      styleColumnLabels(col);
      col.width(110);
     // col.labels().format("{%actualStart}{dateTimeFormat:dd MMM yyyy}");
     col.labels().format("{%baselineStartDate}{dateTimeFormat:dd MMM yyyy}");
    }
  },

  "col-end": {
    title: "Actual End Date",
    configure: (col) => {
      styleColumnTitle(col, "Actual End Date");
      styleColumnLabels(col);
      col.width(110);
      //col.labels().format("{%actualEnd}{dateTimeFormat:dd MMM yyyy}");
      col.labels().format("{%baselineEndDate}{dateTimeFormat:dd MMM yyyy}");
    }
  },

  "col-progress": {
    title: "Progress (%)",
    configure: (col) => {
      styleColumnTitle(col, "Progress (%)");
      styleColumnLabels(col);
      col.width(90);
      col.labels().format("{%progressValue}");
    }
  },

  "col-status": {
    title: "Status",
    configure: (col) => {
      styleColumnTitle(col, "Status");
      styleColumnLabels(col);
      col.width(90);
      col.labels().format("{%status}");
    }
  },

  "col-assignee": {
    title: "Assignee",
    configure: (col) => {
      styleColumnTitle(col, "Assignee");
      styleColumnLabels(col);
      col.width(110);
      col.labels().format("{%assignee}");
    }
  }
};

// ============================================================================
// 2. DOM READY – INITIAL BOOTSTRAP
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  createGanttChart();
  createPertChart();
});


// ============================================================================
// 3. ACTIVE CHART & TOOLBAR EXPORT HELPERS
// ============================================================================

/**
 * Returns the currently active chart instance based on
 * which container has the "active" CSS class: Gantt or PERT.
 */
function getActiveChart() {
  const ganttContainer = document.getElementById("container");
  const pertContainer = document.getElementById("pertContainer");

  if (ganttContainer && ganttContainer.classList.contains("active")) {
    return chartInstance;
  }
  if (pertContainer && pertContainer.classList.contains("active")) {
    return pertChartInstance;
  }
  return null;
}

/**
 * Factory for toolbar handlers (export/print).
 * Calls the given AnyChart export method on the currently active chart.
 */
function createChartHandler(methodName) {
  return () => {
    const activeChart = getActiveChart();
    if (activeChart && typeof activeChart[methodName] === "function") {
      // Filename is controlled globally via anychart.exports.filename()
      const defaultName = "NITISH";
      anychart.exports.filename(defaultName);
      activeChart[methodName]();
    } else {
      console.warn(`Action "${methodName}" not supported or no active chart found.`);
    }
  };
}


// ============================================================================
// 4. EXPORT CURRENT GANTT DATA AS JSON (AND SAVE TO BACKEND)
// ============================================================================

/**
 * Converts an AnyChart Gantt tree node into the JSON shape expected by backend.
 * Preserves complex duration objects and connector arrays.
 */
function nodeToJson(node) {
  // If node is invalid, return null
  if (!node) return null;

  const obj = {};

  // --- A. Map simple fields ---
  obj["id"] = node.get("id");
  obj["name"] = node.get("name");

  // Prefer "actualStart"/"actualEnd"; fall back to "...Date" if needed
  obj["actualStart"] = node.get("actualStart") || node.get("actualStartDate");
  obj["actualEnd"] = node.get("actualEnd") || node.get("actualEndDate");

  // Progress string (e.g. "0.0%")
  obj["progressValue"] = node.get("progressValue");

  obj["milestone"] = node.get("milestone");
  obj["parentTask"] = node.get("parentTask");
  obj["parentId"] = node.get("parentId");

  // --- B. Duration object: { m_duration, m_units } ---
  const durationObj = node.get("duration");
  if (durationObj && typeof durationObj === "object") {
    obj["duration"] = durationObj;
  } else {
    obj["duration"] = {
      "m_duration": node.get("duration") || 0,
      "m_units": "DAYS" // Default if units missing
    };
  }

  // --- C. Connector array: [ { connectTo, connectorType } ] ---
  const connectors = node.get("connector");
  if (connectors && Array.isArray(connectors) && connectors.length > 0) {
    obj["connector"] = connectors;
  }

  // --- D. Children (recursive) ---
  const children = (typeof node.getChildren === "function") ? node.getChildren() : null;

  if (children && children.length > 0) {
    const childJsonArr = [];
    for (let i = 0; i < children.length; i++) {
      const childNode = children[i];
      const childObj = nodeToJson(childNode);
      if (childObj) {
        childJsonArr.push(childObj);
      }
    }
    if (childJsonArr.length > 0) {
      obj["children"] = childJsonArr;
    }
  }

  return obj;
}

/**
 * Exports the entire Gantt tree to JSON:
 * 1) Builds JSON from AnyChart tree
 * 2) Sends to backend via POST
 * 3) Offers a local JSON download
 */
// async function exportGanttAsJson() {
//   if (!treeData) {
//     showToast("No Gantt data to export.");
//     return;
//   }

//   const roots = typeof treeData.getChildren === "function"
//     ? treeData.getChildren()
//     : [];

//   const result = [];
//   for (let i = 0; i < roots.length; i++) {
//     const rootNode = roots[i];
//     const jsonRoot = nodeToJson(rootNode);
//     if (jsonRoot) {
//       result.push(jsonRoot);
//     }
//   }

//   if (!result.length) {
//     showToast("No items found in tree to export.");
//     console.warn("treeData has no exportable nodes.");
//     return;
//   }

//   // 1) Stringify once
//   const jsonString = JSON.stringify(result, null, 2);

//   // 2) Send JSON to backend
//   try {
//     const resp = await fetch(API_SAVE_URL, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: jsonString
//     });

//     if (!resp.ok) {
//       throw new Error("Save failed with status " + resp.status);
//     }

//     console.log("💾 Saved Gantt data to backend (anyChart.json updated).");
//   } catch (e) {
//     console.error("Error saving to backend:", e);
//     showToast("Could not save data to server.");
//   }

//   // 3) Optional: also download a local copy
//   const blob = new Blob([jsonString], { type: "application/json" });
//   const url = URL.createObjectURL(blob);

//   const a = document.createElement("a");
//   a.href = url;
//   const rootName = "data";
//   a.download = `${rootName}.json`;

//   document.body.appendChild(a);
//   a.click();
//   document.body.removeChild(a);

//   URL.revokeObjectURL(url);

//   console.log("✅ Exported Gantt JSON with", result.length, "root item(s)");
// }

/**
 * Normalizes a date string: strips time part if in ISO format (YYYY-MM-DDTHH:mm:ss).
 */




function normalizeDate(dateStr) {
  if (!dateStr) return "";

  if (dateStr.includes("T")) {
    // Take only the date part
    return dateStr.split("T")[0];
  }

  // Already date-only
  return dateStr;
}

// does a POST (save), no GET (reload), no re-render.
//It saves the current Gantt data, but it does not actually “refresh”/reload anything in the UI.
// does a POST (save) and then GET (reload) + re-render
async function refresh() {
  if (!treeData) {
    showToast("No Gantt Data to Refresh.");
    return;
  }

  const roots = typeof treeData.getChildren === "function"
    ? treeData.getChildren()
    : [];

  const result = [];
  for (let i = 0; i < roots.length; i++) {
    const rootNode = roots[i];
    const jsonRoot = nodeToJson(rootNode);
    if (jsonRoot) result.push(jsonRoot);
  }

  if (!result.length) {
    showToast("No items found in tree to export.");
    console.warn("treeData has no exportable nodes.");
    return;
  }

  const jsonString = JSON.stringify(result, null, 2);
  const btn = document.getElementById("refreshBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Refreshing...";
  }

  try {
    const resp = await fetch(API_SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonString
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Save failed (${resp.status}): ${errorText}`);
    }

    console.log("💾 Saved Gantt data to backend (anyChart.json updated).");
   // showToast("Data saved. Loading latest from server...");

    // 🔁 Now pull latest from backend and redraw
    await reloadGanttFromServer();
  } catch (e) {
    console.error("Error saving to backend:", e);
    showToast("Could not save data to server.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Refresh";
    }
  }
}

// GET latest data from backend, rebuild treeData and redraw Gantt
async function reloadGanttFromServer() {
  if (!chartInstance) {
    console.warn("Gantt chart not created yet, cannot reload.");
    showToast("Chart not ready yet.");
    return;
  }

  try {
    const resp = await fetch(API_DATA_URL, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Reload failed (${resp.status}): ${txt}`);
    }

    const data = await resp.json();

    // Update global flatData + treeData
    flatData = Array.isArray(data) ? data : [];
    treeData = anychart.data.tree(flatData, "as-tree");

    // Rebind data to existing chart
    chartInstance.data(treeData);
    //chartInstance.fitAll();     // optional, zoom to fit
    chartInstance.draw();       // safe to call, just redraws

    // Reset selected row state
    selectedRowId = null;
    selectedItemRef = null;
    const label = document.getElementById("selectedTaskLabel");
    if (label) {
      const strong = label.querySelector("strong");
      if (strong) strong.textContent = "-";
    }

    console.log("✅ Gantt data reloaded from server.");
    showToast("Latest Gantt data loaded from server.", "success");
  } catch (err) {
    console.error("❌ Error reloading Gantt data:", err);
    showToast("Failed to load latest data from server.", "error");
  }
}


// ============================================================================
// 5. MODAL FORM: OPEN / CLOSE / EDIT / SUBMIT
// ============================================================================

/**
 * Opens the modal in "Add Child Task" mode.
 * Requires a selected task to act as parent.
 */
function openTaskForm() {
  // Require a selected row to add child under
  if (!selectedRowId) {
    // showToast("Please select a parent task row in the Gantt chart first.");
     showToast("Please select a parent task row in the Gantt chart first.", "warning");
    return;
  }

  const form = document.getElementById("taskForm");
  if (form) form.reset();

  // Set mode to ADD
  window.taskEditMode = "add";

  // Set modal title
  const titleEl = document.querySelector("#taskFormModal h3");
  if (titleEl) titleEl.textContent = "Add Child Task";

  // Show parent id in the form
  const labelSpan = document.getElementById("taskIdLabel");
  const valueSpan = document.getElementById("taskIdValue");
  if (labelSpan) labelSpan.textContent = "Parent Task ID:";
  if (valueSpan) valueSpan.textContent = selectedRowId || "-";

  // Default duration
  const durationInput = document.getElementById("taskDuration");
  if (durationInput) durationInput.value = "0";

  document.getElementById("taskFormModal").style.display = "flex";
}

/**
 * Opens the modal in "Edit Task" mode and populates it
 * with data from the currently selected Gantt row.
 */
function openEditTaskForm() {
  const item = selectedItemRef;

  if (!item) {
    //showToast("Please select a row first.");
    showToast("Please select a row first.");
    return;
  }

  window.taskEditMode = "edit";

  // Show ID
  const labelSpan = document.getElementById("taskIdLabel");
  const valueSpan = document.getElementById("taskIdValue");
  if (labelSpan) labelSpan.textContent = "Task ID:";
  if (valueSpan) valueSpan.textContent = item.get("id") || "-";

  // Canonical + fallback reads
  const name = item.get("name") || "";
  const assignee = item.get("assignee") || "";
  const status = item.get("status") || "PLANNED";

  // Progress: prefer "progressValue" (e.g. "15%"), then numeric keys
  const storedProgress =
    item.get("progressValue") ||
    item.get("progress") ||
    item.get("taskProgress") ||
    "0%";
  const progressNumber = parseInt(String(storedProgress).replace("%", ""), 10) || 0;

  const relation = item.get("relation") || "";
  const duration = item.get("duration") || 0;

  // Dates: normalize to YYYY-MM-DD
  const actualStart = normalizeDate(item.get("actualStart") || item.get("actualStartDate"));
  const actualEnd = normalizeDate(item.get("actualEnd") || item.get("actualEndDate"));

  const baselineStartDate = normalizeDate(item.get("baselineStartDate"));
  const baselineEndDate = normalizeDate(item.get("baselineEndDate"));

  // Populate form fields
  document.getElementById("taskName").value = name;
  document.getElementById("taskAssignee").value = assignee;
  document.getElementById("taskStatus").value = status;
  document.getElementById("taskProgress").value = progressNumber;
  document.getElementById("taskRelation").value = relation;
  document.getElementById("taskDuration").value = duration;

  document.getElementById("baselineStartDate").value = baselineStartDate || "";
  document.getElementById("baselineEndDate").value = baselineEndDate || "";
  document.getElementById("actualStartDate").value = actualStart || "";
  document.getElementById("actualEndDate").value = actualEnd || "";

  const titleEl = document.querySelector("#taskFormModal h3");
  if (titleEl) titleEl.textContent = "Edit Task";

  document.getElementById("taskFormModal").style.display = "flex";
}

/**
 * Handles submit of the task form (both Add and Edit modes),
 * builds payload, and delegates to addChildTask/updateExistingTask.
 */
async function handleTaskFormSubmit(event) {
  event.preventDefault();

  if (!chartInstance || !treeData) {
    showToast("Chart not ready yet");
    return;
  }

  // Read from form
  const name = document.getElementById("taskName").value;
  const relation = document.getElementById("taskRelation").value || "";
  const duration = parseInt(document.getElementById("taskDuration").value || "0", 10) || 0;
  const status = document.getElementById("taskStatus").value || "PLANNED";
  const assignee = document.getElementById("taskAssignee").value || "";

  // Dates from date inputs (YYYY-MM-DD or empty)
  const baselineStartDate = document.getElementById("baselineStartDate").value || null;
  const baselineEndDate = document.getElementById("baselineEndDate").value || null;
  const actualStartValue = document.getElementById("actualStartDate").value || null;
  const actualEndValue = document.getElementById("actualEndDate").value || null;

  // Progress: numeric 0–100 -> string "X%"
  const progressRawNum = parseInt(document.getElementById("taskProgress").value || "0", 10) || 0;
  const progressValue = String(progressRawNum) + "%";

  const formData = {
    name,
    relation,
    duration,
    baselineStartDate,
    baselineEndDate,
    actualStart: actualStartValue,
    actualEnd: actualEndValue,
    progressValue,
    status,
    assignee
  };

  if (window.taskEditMode === "edit") {
    await updateExistingTask(formData);
  } else {
    await addChildTask(formData);
  }

  window.taskEditMode = null;
  closeTaskForm();
}

/**
 * Sends an update to the backend for the currently selected task
 * and then updates the AnyChart Gantt tree + flatData accordingly.
 */
async function updateExistingTask(formData) {
  if (!selectedItemRef || !treeData || !chartInstance) {
    showToast("No selected task to update.");
    return;
  }

  const item = selectedItemRef;
  const id = String(item.get("id"));

  // Build payload for backend
  const payload = {
    id,
    ...formData
  };

  try {
    const resp = await fetch(API_update_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      throw new Error("Backend update failed: HTTP " + resp.status);
    }

    let result = null;
    try {
      result = await resp.json();
    } catch (e) {
      // Some backends may return empty body – ignore
    }
    console.log("✅ Backend update OK:", result);

    // Update chart item
    if (formData.name !== undefined) item.set("name", formData.name);
    if (formData.relation !== undefined) item.set("relation", formData.relation);
    if (formData.duration !== undefined) item.set("duration", Number(formData.duration || 0));

    if (formData.progressValue !== undefined) item.set("progressValue", formData.progressValue);

    if (formData.status !== undefined) item.set("status", formData.status);
    if (formData.assignee !== undefined) item.set("assignee", formData.assignee);

    if (formData.baselineStartDate !== undefined) item.set("baselineStartDate", formData.baselineStartDate);
    if (formData.baselineEndDate !== undefined) item.set("baselineEndDate", formData.baselineEndDate);
    if (formData.actualStart !== undefined) item.set("actualStart", formData.actualStart);
    if (formData.actualEnd !== undefined) item.set("actualEnd", formData.actualEnd);

    // Refresh chart
    chartInstance.data(treeData);

    // Keep flatData in sync if used elsewhere
    if (Array.isArray(flatData)) {
      const idx = flatData.findIndex(t => String(t.id) === String(id));
      if (idx !== -1) {
        flatData[idx] = {
          ...flatData[idx],
          name: formData.name !== undefined ? formData.name : flatData[idx].name,
          relation: formData.relation !== undefined ? formData.relation : flatData[idx].relation,
          duration: formData.duration !== undefined ? Number(formData.duration || 0) : flatData[idx].duration,
          progressValue: formData.progressValue !== undefined ? formData.progressValue : flatData[idx].progressValue,
          status: formData.status !== undefined ? formData.status : flatData[idx].status,
          assignee: formData.assignee !== undefined ? formData.assignee : flatData[idx].assignee,
          baselineStartDate: formData.baselineStartDate !== undefined ? formData.baselineStartDate : flatData[idx].baselineStartDate,
          baselineEndDate: formData.baselineEndDate !== undefined ? formData.baselineEndDate : flatData[idx].baselineEndDate,
          actualStart: formData.actualStart !== undefined ? formData.actualStart : flatData[idx].actualStart,
          actualEnd: formData.actualEnd !== undefined ? formData.actualEnd : flatData[idx].actualEnd
        };
      }
    }

    showToast("Task updated successfully!");
  } catch (err) {
    console.error("❌ Backend update error:", err);
    showToast("Failed to update task on the server.");
  }
}

/**
 * Closes the task modal.
 */
function closeTaskForm() {
  document.getElementById("taskFormModal").style.display = "none";
}

/**
 * Adds a child task under the currently selected parent row
 * and persists it to the backend, then updates the chart.
 */
async function addChildTask(formData) {
  if (!treeData || !chartInstance) {
    showToast("Chart not ready yet.");
    return;
  }

  const parentId = selectedRowId;
  const parentNode = parentId ? treeData.search("id", parentId) : null;
  const tempId = "task_" + Date.now();

  // Step 1: Build payload
  const payload = {
    id: tempId,           // Temporary ID until backend returns real ID
    parentId: parentId || null,
    ...formData
  };

  // Step 2: Confirmation dialog
  const confirmAdd = window.confirm(
    `Are you sure you want to add a child task under "${parentId || "ROOT"}"?`
  );
  if (!confirmAdd) return;

  try {
    // Step 3: POST to backend
    const resp = await fetch(API_ADD_CHILD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      throw new Error("Backend add failed: HTTP " + resp.status);
    }

    // Step 4: Optional parse of saved task (with real ID)
    let savedTask = null;
    try {
      savedTask = await resp.json();
    } catch {
      console.warn("Backend returned no JSON body (ignored).");
    }

    const finalId = savedTask && savedTask.id ? savedTask.id : tempId;

    // Step 5: Update chart with new child
    const newTaskForChart = {
      id: finalId,
      ...formData
    };

    if (parentNode) {
      parentNode.addChild(newTaskForChart);
    } else {
      treeData.addChild(newTaskForChart);
    }

    chartInstance.data(treeData);

    if (Array.isArray(flatData)) {
      flatData.push(newTaskForChart);
    }

    console.log("✅ Child task added under:", parentId, newTaskForChart);
    showToast("Child task added successfully!");
  } catch (err) {
    console.error("❌ Error adding child task:", err);
    showToast("Failed to add child task on the server.");
  }
}


// ============================================================================
// 6. GANTT CHART CREATION & CONFIGURATION
// ============================================================================

/**
 * Creates and initializes the AnyChart Gantt Project chart,
 * loads data from backend, wires events, toolbar, and column menu.
 */
async function createGanttChart() {
  // Load initial data from backend
  const response = await fetch(API_DATA_URL);
  if (!response.ok) {
    console.error("Failed to load gantt data:", response.status);
    return;
  }

  const data = await response.json();

  flatData = data;
  treeData = anychart.data.tree(data, "as-tree");

  const chart = anychart.ganttProject();
  chartInstance = chart;

  // Optional: configure export filename using root task name
  // const rootName = getRootTaskName();
  // anychart.exports.filename(rootName);
  // anychart.exports.filename("My_Custom_Project_Report");

  chart.data(treeData);
  chart.title().fontFamily("Inter, Helvetica, Arial");
  chart.tooltip().fontFamily("Inter, Helvetica, Arial");
  chart.defaultRowHeight(35);
  chart.headerHeight(105);
  chart.getTimeline().elements().height(10);
  chart.getTimeline().scale().maximumGap(1);
  //chart.fitAll();
  chart.getTimeline().scale().fiscalYearStartMonth(1);

  chart.getTimeline().scale().zoomLevels([
  ["day", "week"],
  ["week", "month"],
  ["month", "quarter"]
]);



  // Row select -> remember selected item globally
  chart.listen("rowSelect", function (e) {
    const selectedItem = e.item;
    selectedRowId = selectedItem.get("id");
    selectedItemRef = selectedItem;

    console.log("Row Selected:");
    console.log("ID:", selectedRowId);
    console.log("Name:", selectedItem.get("name"));
    console.log("Assignee:", selectedItem.get("assignee"));
    console.log("Status:", selectedItem.get("status"));
    console.log("------------------------------");

    // Update UI label in toolbar if present
    const label = document.getElementById("selectedTaskLabel");
    if (label) {
      const strong = label.querySelector("strong");
      if (strong) strong.textContent = selectedRowId || "-";
    }
  });

  // Listen for tree updates (debug logging)
  treeData.listen("treeItemUpdate", function (e) {
    console.log("✅ UPDATE DETECTED (Data Changed)");
    console.log("Name:", e.item.get("name"));
    console.log("Assignee:", e.item.get("assignee"));
  });

  // Data grid setup
  const dataGrid = chart.dataGrid();
  chart.splitterPosition(650);
  dataGridInstance = dataGrid;  // expose globally for column controls

  // Tooltip for dataGrid rows
  dataGrid.tooltip().useHtml(true);
  dataGrid.tooltip().format(
    "<span style='font-weight:600;font-size:12pt'>" +
    "{%actualStart}{dateTimeFormat:dd MMM yyyy} - " +
    "{%actualEnd}{dateTimeFormat:dd MMM yyyy}</span><br><br>" +
    "Progress: {%progressValue}<br>" +
    "Task Id: {%id}<br>" +
    "Assignee: {%assignee}"
  );

  // Configure columns in current logical order
  setupColumns();

  // Disable context menu for Gantt (empty menu)
  chart.contextMenu(false);
  const menu = chart.contextMenu();
  menu.itemsFormatter(() => ({}));

  // Attach container & draw
  chart.container("container");
  chart.draw();

  // --- Toolbar export & print buttons ---
  document.getElementById("savePNG").onclick = createChartHandler("saveAsPng");
  document.getElementById("saveJPG").onclick = createChartHandler("saveAsJpg");
  document.getElementById("saveSVG").onclick = createChartHandler("saveAsSvg");
  document.getElementById("savePDF").onclick = createChartHandler("saveAsPdf");
  document.getElementById("saveCSV").onclick = createChartHandler("saveAsCsv");
  document.getElementById("saveXLSX").onclick = createChartHandler("saveAsXlsx");
  document.getElementById("printBtn").onclick = createChartHandler("print");

  // const saveJsonBtn = document.getElementById("saveJSON");
  // if (saveJsonBtn) {
  //   saveJsonBtn.onclick = exportGanttAsJson;
  // }

  // Fullscreen toggle for the currently active chart container
  document.getElementById("fullscreenBtn").onclick = () => {
    const ganttContainer = document.getElementById("container");
    const pertContainer = document.getElementById("pertContainer");
    const activeContainer = ganttContainer.classList.contains("active")
      ? ganttContainer
      : pertContainer.classList.contains("active")
        ? pertContainer
        : null;

    if (activeContainer) {
      if (!document.fullscreenElement) {
        activeContainer
          .requestFullscreen()
          .catch((err) => console.error("Fullscreen failed:", err));
      } else {
        document.exitFullscreen();
      }
    }
  };

  // Initialize drag & drop for columns menu
  initColumnDrag();
}


// ============================================================================
// 7. COLUMN SETUP & REORDERING
// ============================================================================

/**
 * Applies configuration for fixed title column and
 * the logical set of re-orderable columns.
 */
function setupColumns() {
  if (!dataGridInstance) return;

  // 1) Fixed TITLE column at physical column 1
  const titleCol = dataGridInstance.column(1);
  const titleCfg = COLUMN_CONFIG["col-title"];
  const titleCheckbox = document.getElementById("col-title");

  if (titleCfg && titleCol) {
    titleCfg.configure(titleCol);

    if (titleCheckbox) {
      // Initial state and dynamic show/hide
      titleCol.enabled(titleCheckbox.checked);

      titleCheckbox.addEventListener("change", () => {
        titleCol.enabled(titleCheckbox.checked);
      });
    }
  }

  // 2) Reorderable columns start from physical index 2
  logicalColumnOrder.forEach((checkboxId, idx) => {
    const physicalIndex = idx + 2; // index 2 because title is col(1)
    const cfg = COLUMN_CONFIG[checkboxId];
    if (!cfg) return;

    const col = dataGridInstance.column(physicalIndex);
    cfg.configure(col);

    const checkbox = document.getElementById(checkboxId);
    if (checkbox) {
      // Initial state from checkbox
      col.enabled(checkbox.checked);

      // Dynamic show/hide – recompute physical index from DOM order
      checkbox.addEventListener("change", () => {
        if (!dataGridInstance) return;

        const menu = document.getElementById("columnsMenu");
        if (!menu) return;

        const ids = Array.from(
          menu.querySelectorAll(".col-item input[type='checkbox']"))
          .map(cb => cb.id)
          .filter(id => id !== "col-title"); // skip fixed title

        const idxInOrder = ids.indexOf(checkboxId);
        if (idxInOrder === -1) return;

        const c = dataGridInstance.column(idxInOrder + 2); // +2 since title is col(1)
        if (c) c.enabled(checkbox.checked);
      });
    }
  });
}

/**
 * Applies a new logical column order (excluding title column) and
 * re-applies column configuration accordingly.
 */
function applyColumnOrder(newOrder) {
  // Store new logical order for reorderable columns
  logicalColumnOrder = newOrder.slice();

  if (!dataGridInstance) return;

  // 1) Re-apply fixed TITLE in col(1)
  const titleCol = dataGridInstance.column(1);
  const titleCfg = COLUMN_CONFIG["col-title"];
  const titleCheckbox = document.getElementById("col-title");

  if (titleCfg && titleCol) {
    titleCfg.configure(titleCol);
    if (titleCheckbox) {
      titleCol.enabled(titleCheckbox.checked);
    }
  }

  // 2) Re-apply reordered columns starting from col(2)
  logicalColumnOrder.forEach((checkboxId, idx) => {
    const physicalIndex = idx + 2;  // +2 because col(1) is title
    const cfg = COLUMN_CONFIG[checkboxId];
    if (!cfg) return;

    const col = dataGridInstance.column(physicalIndex);
    cfg.configure(col);

    const checkbox = document.getElementById(checkboxId);
    if (checkbox) {
      col.enabled(checkbox.checked);
    }
  });

  if (chartInstance) {
    chartInstance.draw();
  }
}


// ============================================================================
// 8. DRAG & DROP LOGIC IN COLUMNS MENU
// ============================================================================

/**
 * Initializes drag & drop behaviour for items in the column menu.
 * Recomputes the logical column order and applies it on drop.
 */
function initColumnDrag() {
  const menu = document.getElementById("columnsMenu");
  if (!menu) return;

  const items = menu.querySelectorAll(".col-item");
  let draggedEl = null;

  items.forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      draggedEl = item;
      e.dataTransfer.effectAllowed = "move";
      item.classList.add("dragging");
    });

    item.addEventListener("dragend", () => {
      if (draggedEl) draggedEl.classList.remove("dragging");
      draggedEl = null;

      // After drop, compute new order from DOM (excluding title)
      const newOrder = Array.from(
        menu.querySelectorAll(".col-item input[type='checkbox']"))
        .map(cb => cb.id)
        .filter(id => id !== "col-title");  // skip fixed title

      applyColumnOrder(newOrder);
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!draggedEl || draggedEl === item) return;

      const bounding = item.getBoundingClientRect();
      const offset = e.clientY - bounding.top;
      const halfway = bounding.height / 2;

      if (offset > halfway) {
        item.parentNode.insertBefore(draggedEl, item.nextSibling);
      } else {
        item.parentNode.insertBefore(draggedEl, item);
      }
    });
  });
}


// ============================================================================
// 9. STYLING HELPERS FOR COLUMNS
// ============================================================================

/**
 * Applies title styling (header) for a dataGrid column.
 */
function styleColumnTitle(col, text) {
  col.title().text(text);
  col.title().fontColor("#1e293b");
  col.title().fontWeight(700);
  col.title().fontSize(13);
  col.title().padding(5, 0, 5, 10);
  col.title().fontFamily("'Inter', Helvetica, Arial, sans-serif");
  return col;
}

/**
 * Applies label styling (cell text) for a dataGrid column.
 */
function styleColumnLabels(col) {
  col.labels().fontColor("#334155");
  col.labels().fontSize(12);
  col.labels().padding(4, 0, 4, 10);
  return col;
}


// ============================================================================
// 10. PERT CHART CREATION
// ============================================================================

/**
 * Creates and initializes the AnyChart PERT chart using the same
 * Gantt data source, using connectors to build dependencies.
 */
async function createPertChart() {
  // Load initial data from backend
  const response = await fetch("/api/gantt/data");
  if (!response.ok) {
    console.error("Failed to load gantt data:", response.status);
    return;
  }

  const ganttData = await response.json();
  const tree = anychart.data.tree(ganttData, "as-tree");

  const pertData = [];
  const dependencies = [];

  // Recursively traverse tree and build PERT tasks & dependencies
  function traverse(node) {
    const id = node.get("id");
    const name = node.get("name");
    const startRaw = node.get("actualStartDate") || node.get("actualStart");
    const endRaw = node.get("actualEndDate") || node.get("actualEnd");
    const start = new Date(startRaw);
    const end = new Date(endRaw);

    const duration = Math.max(
      1,
      (end - start) / (1000 * 60 * 60 * 24) // days
    );

    pertData.push({ id, name, duration });

    const connectTo = node.get("connectTo");
    if (connectTo) {
      dependencies.push({ from: connectTo, to: id });
    }

    const children = node.getChildren();
    for (let i = 0; i < children.length; i++) traverse(children[i]);
  }

  tree.getChildren().forEach(traverse);

  anychart.onDocumentReady(function () {
    const chart = anychart.pert();
    pertChartInstance = chart;

    chart.data(pertData, "as-table", dependencies);
    chart.milestones().labels().fontSize(10);
    chart.verticalSpacing(70);
    chart.horizontalSpacing(89);
    chart.milestones().size(25);

    chart.criticalPath({
      milestones: { fill: "#FF4040", selectFill: "#92000A" }
    });

    chart.contextMenu(true);
    const menu = chart.contextMenu();
    menu.itemsFormatter(() => ({}));

    chart.container("pertContainer");
    chart.draw();
  });
}
