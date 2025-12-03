// ===== 1. Global state =====
let chartInstance = null;       // Gantt chart
let treeData = null;            // Gantt data tree
let pertChartInstance = null;   // PERT chart

let selectedRowId = null;       // currently selected Gantt row id
let selectedItemRef = null;     // reference to selected data item
let flatData = [];              // original array-based data (if needed elsewhere)
let dataGridInstance = null;    // reference to Gantt dataGrid

// Single endpoint that saves the entire updated Gantt JSON on server
const API_SAVE_URL = "/api/gantt/save";

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




// === Helper: get root task name for export filenames ===
function getRootTaskName() {
  if (!window.treeData || typeof window.treeData.getChildren !== "function") {
    return "project";
  }

  const roots = window.treeData.getChildren();
  if (!roots || roots.length === 0) {
    return "project";
  }

  const rootNode = roots[0];
  const name = rootNode.get ? rootNode.get("name") : rootNode.name;
  if (!name) return "project";

  // Clean up name for safe file naming (remove spaces/special chars)
  return name.replace(/[^a-zA-Z0-9-_]/g, "_");
}

// Start once DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  createGanttChart();
  createPertChart();
});


// ===== 2. Active chart + toolbar helpers =====
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

function createChartHandler(methodName) {
  return () => {
    const activeChart = getActiveChart();
    if (activeChart && typeof activeChart[methodName] === "function") {
      // filename is controlled globally via anychart.exports.filename()
      activeChart[methodName]();
    } else {
      console.warn(`Action "${methodName}" not supported or no active chart found.`);
    }
  };
}



// ===== 3. Export current Gantt data as JSON file + POST to backend =====
// function nodeToJson(node) {
//   if (!node || typeof node.get !== "function") return null;

//   const obj = {};

//   // Fields to include in exported JSON
//   const FIELDS = [
//     "id",
//     "name",
//     "relation",
//     "duration",
//     "baselineStartDate",
//     "baselineEndDate",
//     "actualStartDate",
//     "actualEndDate",
//     "progressPercentage",
//     "status",
//     "assignee",
//     "parent",
//     "connectTo",
//     "connectorType"
//   ];

//   FIELDS.forEach((field) => {
//     const value = node.get(field);
//     if (value !== undefined && value !== null && value !== "") {
//       obj[field] = value;
//     }
//   });

//   // Recursively handle children
//   const children = typeof node.getChildren === "function" ? node.getChildren() : null;

//   if (children && children.length) {
//     const childJsonArr = [];
//     for (let i = 0; i < children.length; i++) {
//       const childNode = children[i];
//       const childObj = nodeToJson(childNode);
//       if (childObj && Object.keys(childObj).length > 0) {
//         childJsonArr.push(childObj);
//       }
//     }
//     if (childJsonArr.length) {
//       obj.children = childJsonArr;
//     }
//   }

//   // If node has no fields and no children, skip it
//   if (!Object.keys(obj).length) {
//     return null;
//   }

//   return obj;
// }
// ===== 3. Export current Gantt data as JSON file =====

function nodeToJson(node) {
  // If node is invalid, return null
  if (!node) return null;

  // 1. Extract the raw data object from the AnyChart node
  //    This preserves custom fields like 'm_duration' inside the 'duration' object
  const obj = {};

  // --- A. Map Simple Fields (Using your specific JSON keys) ---
  obj["id"] = node.get("id");
  obj["name"] = node.get("name");

  // Use "actualStart" instead of "actualStartDate" per your JSON
  obj["actualStart"] = node.get("actualStart") || node.get("actualStartDate");
  obj["actualEnd"] = node.get("actualEnd") || node.get("actualEndDate");

  // Use "progressValue" (string "0.0%") instead of number
  obj["progressValue"] = node.get("progressValue");

  obj["milestone"] = node.get("milestone");
  obj["parentTask"] = node.get("parentTask");
  obj["parentId"] = node.get("parentId");

  // --- B. Map Complex Objects (Duration) ---
  // Your JSON has duration as: { "m_duration": 17.6, "m_units": "DAYS" }
  const durationObj = node.get("duration");
  if (durationObj && typeof durationObj === 'object') {
    obj["duration"] = durationObj;
  } else {
    // Fallback if chart flattened it, reconstruct the object
    obj["duration"] = {
      "m_duration": node.get("duration") || 0,
      "m_units": "DAYS" // Defaulting to DAYS if missing
    };
  }

  // --- C. Map Array Objects (Connectors) ---
  // Your JSON has connector as: [{ "connectTo": "4", "connectorType": "finish-start" }]
  const connectors = node.get("connector");
  if (connectors && Array.isArray(connectors) && connectors.length > 0) {
    obj["connector"] = connectors;
  }

  // --- D. Handle Children Recursively ---
  // Check if the node has children (AnyChart specific method)
  const children = (typeof node.getChildren === "function") ? node.getChildren() : null;

  if (children && children.length > 0) {
    const childJsonArr = [];
    for (let i = 0; i < children.length; i++) {
      const childNode = children[i];
      const childObj = nodeToJson(childNode); // Recursion
      if (childObj) {
        childJsonArr.push(childObj);
      }
    }
    // Only add children array if it's not empty
    if (childJsonArr.length > 0) {
      obj["children"] = childJsonArr;
    }
  }

  return obj;
}

async function exportGanttAsJson() {
  if (!treeData) {
    alert("No Gantt data to export.");
    return;
  }

  const roots = typeof treeData.getChildren === "function"
    ? treeData.getChildren()
    : [];

  const result = [];
  for (let i = 0; i < roots.length; i++) {
    const rootNode = roots[i];
    const jsonRoot = nodeToJson(rootNode);
    if (jsonRoot) {
      result.push(jsonRoot);
    }
  }

  if (!result.length) {
    alert("No items found in tree to export.");
    console.warn("treeData has no exportable nodes.");
    return;
  }

  // 1) stringify once
  const jsonString = JSON.stringify(result, null, 2);

  // 2) SEND TO BACKEND (save entire structure)
  try {
    const resp = await fetch(API_SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonString,
    });

    if (!resp.ok) {
      throw new Error("Save failed with status " + resp.status);
    }

    console.log("💾 Saved Gantt data to backend (anyChart.json updated).");
  } catch (e) {
    console.error("Error saving to backend:", e);
    alert("Could not save data to server.");
  }

  // 3) OPTIONAL: also download a local copy
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  const rootName = getRootTaskName();
  a.download = `${rootName}.json`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);

  console.log("✅ Exported Gantt JSON with", result.length, "root item(s)");
}

function normalizeDate(dateStr) {
  if (!dateStr) return "";

  // If format includes "T", split to take only the YYYY-MM-DD part
  if (dateStr.includes("T")) {
    return dateStr.split("T")[0];
  }

  // If already YYYY-MM-DD, return as is
  return dateStr;
}


// ===== 4. Modal form: open / close / edit =====

// Open form for ADD CHILD
function openTaskForm() {
  // Require a selected row to add child under
  if (!selectedRowId) {
    alert("Please select a parent task row in the Gantt chart first.");
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

// Open form for UPDATE
// ------------------ openEditTaskForm ------------------
function openEditTaskForm() {
  const item = selectedItemRef;

  if (!item) {
    alert("Please select a row first.");
    return;
  }

  window.taskEditMode = "edit";

  // show ID
  const labelSpan = document.getElementById("taskIdLabel");
  const valueSpan = document.getElementById("taskIdValue");
  if (labelSpan) labelSpan.textContent = "Task ID:";
  if (valueSpan) valueSpan.textContent = item.get("id") || "-";

  // canonical + fallback reads
  const name = item.get("name") || "";
  const assignee = item.get("assignee") || "";
  const status = item.get("status") || "PLANNED";
  // progress: prefer "progressValue" (e.g. "15%"), then numeric keys
  const storedProgress = item.get("progressValue") || item.get("progress") || item.get("taskProgress") || "0%";
  const progressNumber = parseInt(String(storedProgress).replace("%", ""), 10) || 0;

  const relation = item.get("relation") || "";
  const duration = item.get("duration") || 0;

  // Dates: prefer Gantt-standard keys, fall back to *_Date fields if present
  // const baselineStartDate = item.get("baselineStartDate") || "";
  // const baselineEndDate   = item.get("baselineEndDate")   || "";
  // const actualStart       = item.get("actualStart")       || item.get("actualStartDate") || "";
  // const actualEnd         = item.get("actualEnd")         || item.get("actualEndDate")   || "";
  const actualStart = normalizeDate(item.get("actualStart") || item.get("actualStartDate"));
  const actualEnd = normalizeDate(item.get("actualEnd") || item.get("actualEndDate"));

  const baselineStartDate = normalizeDate(item.get("baselineStartDate"));
  const baselineEndDate = normalizeDate(item.get("baselineEndDate"));


  // populate form (IDs match your HTML)
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

// ------------------ handleTaskFormSubmit ------------------
async function handleTaskFormSubmit(event) {
  event.preventDefault();

  if (!chartInstance || !treeData) {
    alert("Chart not ready yet");
    return;
  }

  // read from form (IDs from your HTML)
  const name = document.getElementById("taskName").value;
  const relation = document.getElementById("taskRelation").value || "";
  const duration = parseInt(document.getElementById("taskDuration").value || "0", 10) || 0;
  const status = document.getElementById("taskStatus").value || "PLANNED";
  const assignee = document.getElementById("taskAssignee").value || "";

  // Dates from inputs (type="date") -> keep as YYYY-MM-DD (or empty)
  const baselineStartDate = document.getElementById("baselineStartDate").value || null;
  const baselineEndDate = document.getElementById("baselineEndDate").value || null;
  const actualStartValue = document.getElementById("actualStartDate").value || null;
  const actualEndValue = document.getElementById("actualEndDate").value || null;

  // Progress: form numeric (0-100) -> string with %
  const progressRawNum = parseInt(document.getElementById("taskProgress").value || "0", 10) || 0;
  const progressValue = String(progressRawNum) + "%";

  const formData = {
    name,
    relation,
    duration,
    // canonical keys expected by Gantt/backend:
    baselineStartDate,
    baselineEndDate,
    actualStart: actualStartValue,
    actualEnd: actualEndValue,
    progressValue,   // "15%"
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

// ------------------ updateExistingTask ------------------
async function updateExistingTask(formData) {
  if (!selectedItemRef || !treeData || !chartInstance) {
    alert("No selected task to update.");
    return;
  }

  const item = selectedItemRef;
  const id = String(item.get("id"));

  // Build payload for backend (use same canonical keys)
  const payload = {
    id,
    ...formData
  };

  try {
    const resp = await fetch("/api/gantt/task/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      throw new Error("Backend update failed: HTTP " + resp.status);
    }

    // Optional parse
    let result = null;
    try { result = await resp.json(); } catch (e) { /* ignore */ }
    console.log("✅ Backend update OK:", result);

    // Update the chart item using canonical names
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

    // refresh chart
    chartInstance.data(treeData);

    // Keep flatData in sync if you use it
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

    alert("Task updated successfully!");
  } catch (err) {
    console.error("❌ Backend update error:", err);
    alert("Failed to update task on the server.");
  }
}


function closeTaskForm() {
  document.getElementById("taskFormModal").style.display = "none";
}




// ADD CHILD TASK
async function addChildTask(formData) {
  if (!treeData || !chartInstance) {
    alert("Chart not ready yet.");
    return;
  }

  const parentId = selectedRowId;
  const parentNode = parentId ? treeData.search("id", parentId) : null;
  const tempId = "task_" + Date.now();

  // ✅ Step 1: Build payload
  const payload = {
    id: tempId,           // Temporary ID until backend gives a real one
    parentId: parentId || null,
    ...formData
  };

  // ✅ Step 2: Confirmation before calling backend
  const confirmAdd = window.confirm(
    `Are you sure you want to add a child task under "${parentId || "ROOT"}"?`
  );
  if (!confirmAdd) return;

  try {
    // ✅ Step 3: POST CALL TO BACKEND
    const resp = await fetch("/api/gantt/task/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Check backend response
    if (!resp.ok) {
      throw new Error("Backend add failed: HTTP " + resp.status);
    }

    // ✅ Step 4: Optional — backend may send back a task object with real ID
    let savedTask = null;
    try {
      savedTask = await resp.json();
    } catch {
      console.warn("Backend returned no JSON body (ignored).");
    }

    const finalId = savedTask && savedTask.id ? savedTask.id : tempId;

    // ✅ Step 5: Update chart with new child
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
    alert("Child task added successfully!");

  } catch (err) {
    console.error("❌ Error adding child task:", err);
    alert("Failed to add child task on the server.");
  }
}

// ===== 6. Gantt chart creation =====
async function createGanttChart() {
  // Load initial data from backend
  const response = await fetch("/api/gantt/data");
  if (!response.ok) {
    console.error("Failed to load gantt data:", response.status);
    return;
  }
  const data = await response.json();

  flatData = data;
  treeData = anychart.data.tree(data, "as-tree");

  const chart = anychart.ganttProject();
  chartInstance = chart;

  // Set default export filename for AnyChart (PNG, PDF, CSV, XLSX, etc.)
  const rootName = getRootTaskName();
  anychart.exports.filename(rootName);

  chart.data(treeData);
  chart.title().fontFamily("Inter, Helvetica, Arial");
  chart.tooltip().fontFamily("Inter, Helvetica, Arial");
  chart.defaultRowHeight(35);
  chart.headerHeight(105);
  chart.getTimeline().elements().height(20);
  chart.getTimeline().scale().maximumGap(1.2);
  chart.fitAll();

  // Row select -> remember selected item
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

  // Optional: log changes
  treeData.listen("treeItemUpdate", function (e) {
    console.log("✅ UPDATE DETECTED (Data Changed)");
    console.log("Name:", e.item.get("name"));
    console.log("Assignee:", e.item.get("assignee"));
  });

  // --- Data grid setup ---
  const dataGrid = chart.dataGrid();
  chart.splitterPosition(650);
  dataGridInstance = dataGrid;  // expose globally


  function styleColumnTitle(col, text) {
    col.title().text(text);
    col.title().fontColor("#1e293b");
    col.title().fontWeight(700);
    col.title().fontSize(13);
    col.title().padding(5, 0, 5, 10);
    col.title().fontFamily("'Inter', Helvetica, Arial, sans-serif");
    return col;
  }

  function styleColumnLabels(col) {
    col.labels().fontColor("#334155");
    col.labels().fontSize(12);
    col.labels().padding(4, 0, 4, 10);
    return col;
  }

  // 1) Title (Task Name) – column 1
  const colTask = dataGrid.column(1);
  styleColumnTitle(colTask, "Task Details");
  styleColumnLabels(colTask);
  colTask.width(250);
  colTask.labels().useHtml(true);
  colTask.collapseExpandButtons(true);
  colTask.depthPaddingMultiplier(20);
  colTask.labels().format(function () {
    const item = this.item;
    const name = item && item.get ? item.get("name") : "(Unnamed)";
    const safeName = String(name).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const isParent = item && item.numChildren && item.numChildren() > 0;
    const style = isParent
      ? "font-weight:600; color:#0d47a1;font-family: Inter, Helvetica, Arial, sans-serif"
      : "font-weight:400; color:#374151;font-family: Inter, Helvetica, Arial, sans-serif";
    return `<span style="${style}">${safeName}</span>`;
  });

  // 2) Relation – column 2
  const colRelation = dataGrid.column(2);
  styleColumnTitle(colRelation, "Relation");
  styleColumnLabels(colRelation);
  colRelation.width(90);
  colRelation.labels().format("{%relation}");

  // 3) Duration – column 3
  const colDuration = dataGrid.column(3);
  styleColumnTitle(colDuration, "Duration");
  styleColumnLabels(colDuration);
  colDuration.width(90);
  colDuration.labels().format("{%duration}");

  // 4) Baseline Start Date – column 4
  const colBaselineStart = dataGrid.column(4);
  styleColumnTitle(colBaselineStart, "Baseline Start Date");
  styleColumnLabels(colBaselineStart);
  colBaselineStart.width(110);
  colBaselineStart
    .labels()
    .format("{%baselineStartDate}{dateTimeFormat:dd MMM yyyy}");

  // 5) Baseline End Date – column 5
  const colBaselineEnd = dataGrid.column(5);
  styleColumnTitle(colBaselineEnd, "Baseline End Date");
  styleColumnLabels(colBaselineEnd);
  colBaselineEnd.width(110);
  colBaselineEnd
    .labels()
    .format("{%baselineEndDate}{dateTimeFormat:dd MMM yyyy}");

  // 6) Actual Start Date – column 6
  const colActualStart = dataGrid.column(6);
  styleColumnTitle(colActualStart, "Actual Start Date");
  styleColumnLabels(colActualStart);
  colActualStart.width(110);
  colActualStart
    .labels()
    .format("{%actualStart}{dateTimeFormat:dd MMM yyyy}");

  // 7) Actual End Date – column 7
  const colActualEnd = dataGrid.column(7);
  styleColumnTitle(colActualEnd, "Actual End Date");
  styleColumnLabels(colActualEnd);
  colActualEnd.width(110);
  colActualEnd
    .labels()
    .format("{%actualEnd}{dateTimeFormat:dd MMM yyyy}");

  // 8) Progress Percentage – column 8
  const colProgress = dataGrid.column(8);
  styleColumnTitle(colProgress, "Progress (%)");
  styleColumnLabels(colProgress);
  colProgress.width(90);
  colProgress.labels().format("{%progressValue}");

  // 9) Status – column 9
  const colStatus = dataGrid.column(9);
  styleColumnTitle(colStatus, "Status");
  styleColumnLabels(colStatus);
  colStatus.width(90);
  colStatus.labels().format("{%status}");

  // 10) Assignee – column 10
  const colAssignee = dataGrid.column(10);
  styleColumnTitle(colAssignee, "Assignee");
  styleColumnLabels(colAssignee);
  colAssignee.width(110);
  colAssignee.labels().format("{%assignee}");

  // Tooltip (optional: still uses old actualStart/actualEnd if present)
  dataGrid.tooltip().useHtml(true);
  dataGrid.tooltip().format(
    "<span style='font-weight:600;font-size:12pt'>" +
    "{%actualStart}{dateTimeFormat:dd MMM yyyy} - " +
    "{%actualEnd}{dateTimeFormat:dd MMM yyyy}</span><br><br>" +
    "Progress: {%progressValue}<br>" +
    "Task Id: {%id}<br>" +
    "Assignee: {%assignee}"
  );

  // Turn off context menu
  chart.contextMenu(false);
  const menu = chart.contextMenu();
  menu.itemsFormatter(() => ({}));

  // Container + draw
  chart.container("container");
  chart.draw();

  // --- Toolbar handlers ---
  document.getElementById("savePNG").onclick = createChartHandler("saveAsPng");
  document.getElementById("saveJPG").onclick = createChartHandler("saveAsJpg");
  document.getElementById("saveSVG").onclick = createChartHandler("saveAsSvg");
  document.getElementById("savePDF").onclick = createChartHandler("saveAsPdf");
  document.getElementById("saveCSV").onclick = createChartHandler("saveAsCsv");
  document.getElementById("saveXLSX").onclick = createChartHandler("saveAsXlsx");
  document.getElementById("printBtn").onclick = createChartHandler("print");

  const saveJsonBtn = document.getElementById("saveJSON");
  if (saveJsonBtn) {
    saveJsonBtn.onclick = exportGanttAsJson;
  }

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

  // ==== Column visibility checkboxes ====
  Object.entries(COLUMN_MAP).forEach(([checkboxId, colIndex]) => {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox) return;

    // set default (all checked -> all visible)
    checkbox.checked = true;

    checkbox.addEventListener("change", () => {
      if (!chartInstance || !dataGridInstance) return;

      const col = dataGridInstance.column(colIndex);
      if (!col) return;

      col.enabled(checkbox.checked);
    });
  });
}



// ===== 7. PERT chart creation =====
async function createPertChart() {
  // Load initial data from backend
  const response = await fetch("/api/gantt/data");
  if (!response.ok) {
    console.error("Failed to load gantt data:", response.status);
    return;
  }
  // const data = await response.json();
  // // You can also pull this from backend if needed
  // const response = await fetch("updated.json");
  const ganttData = await response.json();
  const tree = anychart.data.tree(ganttData, "as-tree");

  const pertData = [];
  const dependencies = [];

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
