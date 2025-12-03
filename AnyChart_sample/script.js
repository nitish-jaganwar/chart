// ===== 1. Global state =====
let chartInstance = null;       // Gantt chart
let treeData = null;            // Gantt data tree
let pertChartInstance = null;   // PERT chart

let selectedRowId = null;       // currently selected Gantt row id
let selectedItemRef = null;     // reference to selected data item
let flatData = [];              // original array-based data (if needed elsewhere)

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
      activeChart[methodName]();
    } else {
      console.warn(`Action "${methodName}" not supported or no active chart found.`);
    }
  };
}


// ===== 3. Export current Gantt data as JSON file =====
function nodeToJson(node) {
  if (!node || typeof node.get !== "function") return null;

  const obj = {};

  // Fields to include in exported JSON
  const FIELDS = [
    "id",
    "name",
    "actualStart",
    "actualEnd",
    "progress",
    "progressValue",
    "status",
    "assignee",
    "parent",
    "connectTo",
    "connectorType"
  ];

  FIELDS.forEach((field) => {
    const value = node.get(field);
    if (value !== undefined && value !== null && value !== "") {
      obj[field] = value;
    }
  });

  // Recursively handle children
  const children = typeof node.getChildren === "function" ? node.getChildren() : null;

  if (children && children.length) {
    const childJsonArr = [];
    for (let i = 0; i < children.length; i++) {
      const childNode = children[i];
      const childObj = nodeToJson(childNode);
      if (childObj && Object.keys(childObj).length > 0) {
        childJsonArr.push(childObj);
      }
    }
    if (childJsonArr.length) {
      obj.children = childJsonArr;
    }
  }

  // If node has no fields and no children, skip it
  if (!Object.keys(obj).length) {
    return null;
  }

  return obj;
}

function exportGanttAsJson() {
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

  const jsonString = JSON.stringify(result, null, 2);

  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "gantt-data-updated.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);

  console.log("✅ Exported Gantt JSON with", result.length, "root item(s)");
}


// ===== 4. Modal form: open / close / edit =====
function openTaskForm() {
  const form = document.getElementById("taskForm");
  if (form) form.reset();

  window.taskEditMode = "add";
  const titleEl = document.querySelector("#taskFormModal h3");
  if (titleEl) titleEl.textContent = "Add Child Task";

  document.getElementById("taskFormModal").style.display = "flex";
}

function openEditTaskForm() {
  const item = selectedItemRef;

  if (!item) {
    alert("Please select a row first.");
    return;
  }

  const name = item.get("name") || "";
  const start = item.get("actualStart") || "";
  const end = item.get("actualEnd") || "";
  const assignee = item.get("assignee") || "";
  const status = item.get("status") || "";
  const progress = (item.get("progressValue") || "0").toString().replace("%", "");

  const startDateOnly = start ? start.split("T")[0] : "";
  const endDateOnly = end ? end.split("T")[0] : "";

  document.getElementById("taskName").value = name;
  document.getElementById("taskStart").value = startDateOnly;
  document.getElementById("taskEnd").value = endDateOnly;
  document.getElementById("taskAssignee").value = assignee;
  document.getElementById("taskStatus").value = status || "PLANNED";
  document.getElementById("taskProgress").value = progress;

  window.taskEditMode = "edit";
  const titleEl = document.querySelector("#taskFormModal h3");
  if (titleEl) titleEl.textContent = "Edit Task";

  document.getElementById("taskFormModal").style.display = "flex";
}

function closeTaskForm() {
  document.getElementById("taskFormModal").style.display = "none";
}


// ===== 5. Create / update task from form =====
function addChildTaskFromForm(event) {
  event.preventDefault();

  if (!chartInstance || !treeData) {
    alert("Chart not ready yet");
    return;
  }

  const name        = document.getElementById("taskName").value;
  const actualStart = document.getElementById("taskStart").value; // "YYYY-MM-DD"
  const actualEnd   = document.getElementById("taskEnd").value;
  const progressRaw = document.getElementById("taskProgress").value || "0";
  const status      = document.getElementById("taskStatus").value;
  const assignee    = document.getElementById("taskAssignee").value || "";

  const progressValue = progressRaw + "%";

  // EDIT MODE
  if (window.taskEditMode === "edit") {
    const item = selectedItemRef;
    if (!item) {
      alert("No row selected to edit.");
      return;
    }

    item.set("name", name);
    item.set("actualStart", actualStart);
    item.set("actualEnd", actualEnd);
    item.set("progressValue", progressValue);
    item.set("status", status);
    item.set("assignee", assignee);

    chartInstance.data(treeData);
    console.log("Updated task:", item.get("id"));
  } else {
    // ADD MODE
    const parentId = selectedRowId;
    const parentNode = parentId ? treeData.search("id", parentId) : null;
    const newId = "task_" + Date.now();

    const newTask = {
      id: newId,
      name,
      actualStart,
      actualEnd,
      progressValue,
      status,
      assignee
    };

    if (parentNode) {
      parentNode.addChild(newTask);
    } else {
      treeData.addChild(newTask);
    }

    chartInstance.data(treeData);
    if (Array.isArray(flatData)) {
      flatData.push(newTask);
    }

    console.log("Child Task Added Under:", parentId, newTask);
  }

  window.taskEditMode = null;
  closeTaskForm();
}


// ===== 6. Gantt chart creation =====
async function createGanttChart() {
  const response = await fetch("anyChart.json");
  const data = await response.json();

  flatData = data;
  treeData = anychart.data.tree(data, "as-tree");

  const chart = anychart.ganttProject();
  chartInstance = chart;

  chart.data(treeData);
  chart.title().fontFamily("Inter, Helvetica, Arial");
  chart.tooltip().fontFamily("Inter, Helvetica, Arial");
  chart.defaultRowHeight(35);
  chart.headerHeight(105);
  chart.getTimeline().elements().height(20);
  //chart.edit(true);
  chart.getTimeline().scale().maximumGap(1.2);

  // Row select -> remember selected item
  chart.listen("rowSelect", function (e) {
    const selectedItem = e.item;
    selectedRowId = selectedItem.get("id");
    selectedItemRef = selectedItem;

    console.log("Row Selected:");
    console.log("ID:", selectedRowId);
    console.log("Name:", selectedItem.get("name"));
    console.log("startdate:", selectedItem.get("actualStart"));
    console.log("endDate:", selectedItem.get("actualEnd"));
    console.log("asignee:", selectedItem.get("assignee"));
    console.log("status:", selectedItem.get("status"));
    console.log("------------------------------");
  });

  // Optional: log changes
  treeData.listen("treeItemUpdate", function (e) {
    console.log("✅ UPDATE DETECTED (Data Changed)");
    console.log("Name:", e.item.get("name"));
    console.log("Assignee:", e.item.get("assignee"));
    console.log(
      "New Start:",
      new Date(e.item.get("actualStart")).toLocaleDateString()
    );
    console.log(
      "New End:",
      new Date(e.item.get("actualEnd")).toLocaleDateString()
    );
  });

  // --- Data grid setup ---
  const dataGrid = chart.dataGrid();
  chart.splitterPosition(650);

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

  // Actions column
  const colAction = dataGrid.column(5);
  styleColumnTitle(colAction, "Actions");
  colAction.width(110);
  colAction.labels().useHtml(true);
  colAction.collapseExpandButtons(false);
  colAction.depthPaddingMultiplier(0);
  colAction.labels().format(function () {
    const id = this.item && this.item.get ? this.item.get("id") : "";
    return `
      <div class="proj-action-group" data-id="${id}">
        <button class="proj-action-btn" type="button" data-action="view" data-id="${id}" title="View Details">
          <span class="material-icons">visibility</span>
        </button>
        <button class="proj-action-btn" type="button" data-action="update" data-id="${id}" title="Update Task">
          <span class="material-icons">edit</span>
        </button>
        <button class="proj-action-btn" type="button" data-action="addChild" data-id="${id}" title="Add Child Task">
          <span class="material-icons">add_circle_outline</span>
        </button>
      </div>
    `;
  });

  // Task name column
  const colTask = dataGrid.column(1);
  styleColumnTitle(colTask, "Project / Task");
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

  // Start column
  const colStart = dataGrid.column(2);
  styleColumnTitle(colStart, "Start");
  styleColumnLabels(colStart);
  colStart.width(90);
  colStart.labels()
    .format("{%actualStart}{dateTimeFormat:dd MMM yyyy}")
    .fontFamily("Inter, Helvetica, Arial, sans-serif");

  // End column
  const colEnd = dataGrid.column(3);
  styleColumnTitle(colEnd, "End");
  styleColumnLabels(colEnd);
  colEnd.width(90);
  colEnd.labels().format("{%actualEnd}{dateTimeFormat:dd MMM yyyy}");

  // Progress column
  const colProgress = dataGrid.column(4);
  styleColumnTitle(colProgress, "Progress (%)");
  styleColumnLabels(colProgress);
  colProgress.width(80);
  colProgress.labels().format("{%progress}");

  // Status column
  const statusCol = dataGrid.column(6);
  styleColumnTitle(statusCol, "Status");
  styleColumnLabels(statusCol);
  statusCol.width(80);
  statusCol.labels().format("{%status}");

  // Assignee column
  const assigneeCol = dataGrid.column(7);
  styleColumnTitle(assigneeCol, "Assignee");
  styleColumnLabels(assigneeCol);
  assigneeCol.width(80);
  assigneeCol.labels().format("{%assignee}");

  // Tooltip
  dataGrid.tooltip().useHtml(true);
  dataGrid.tooltip().format(
    "<span style='font-weight:600;font-size:12pt'>" +
      "{%actualStart}{dateTimeFormat:dd MMM yyyy} - " +
      "{%actualEnd}{dateTimeFormat:dd MMM yyyy}</span><br><br>" +
      "Progress: {%progress}<br>" +
      "Task Id: {%id}<br>" +
      "Assignee: {%assignee}"
  );

  // --- Action buttons click handler (view / update / addChild via API stubs) ---
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".proj-action-btn");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!action || !id) return;
    performAction(action, id);
  });

  // Helper to find a node by id (tree or raw)
  window._ganttRawData = data;
  function findTaskByIdFlexible(id) {
    try {
      const root = chart.data();
      if (root && typeof root.search === "function") {
        let found = null;
        root.search(function (n) {
          if (String(n.get("id")) === String(id)) {
            found = n;
            return true;
          }
          return false;
        });
        if (found) return { node: found, raw: null };
      }
    } catch (err) {
      console.warn("findTaskByIdFlexible error:", err);
    }

    function findInRaw(arr) {
      for (const it of arr) {
        if (String(it.id) === String(id)) return it;
        if (it.children) {
          const child = findInRaw(it.children);
          if (child) return child;
        }
      }
      return null;
    }

    return { node: null, raw: findInRaw(window._ganttRawData) };
  }

  function performAction(action, id) {
    const found = findTaskByIdFlexible(id);

    if (action === "addChild") {
      console.log("Adding child for task ID:", id);
      // Stub API call – wire to your real backend later
      fetch("https://example.com/api/add-child-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: id })
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("Add Child response:", data);
          alert(`Child task added under ID ${id}!`);
        })
        .catch((err) => {
          console.error("Add Child error:", err);
          alert("Error adding child task.");
        });
    }

    if (action === "update") {
      console.log("Updating task ID:", id);
      fetch("https://example.com/api/update-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("Update response:", data);
          alert(`Task ${id} updated successfully!`);
        })
        .catch((err) => {
          console.error("Update error:", err);
          alert("Error updating task.");
        });
    }

    if (action === "view") {
      const node = found.node || found.raw;
      if (node) {
        const name = node.get ? node.get("name") : node.name;
        const start = node.get ? node.get("actualStart") : node.actualStart;
        const end = node.get ? node.get("actualEnd") : node.actualEnd;
        alert(`📋 Task: ${name}\nStart: ${start}\nEnd: ${end}`);
      }
    }
  }

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
}


// ===== 7. PERT chart creation =====
async function createPertChart() {
  const response = await fetch("anyChart.json");
  const ganttData = await response.json();
  const tree = anychart.data.tree(ganttData, "as-tree");

  const pertData = [];
  const dependencies = [];

  function traverse(node) {
    const id = node.get("id");
    const name = node.get("name");
    const start = new Date(node.get("actualStart"));
    const end = new Date(node.get("actualEnd"));

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
