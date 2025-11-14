let chartInstance = null;
let treeData = null;
let pertChartInstance = null; // Global PERT chart instance 

// --- Helper function to find the currently active chart instance ---
function getActiveChart() {
  const ganttContainer = document.getElementById('container');
  const pertContainer = document.getElementById('pertContainer');

  if (ganttContainer && ganttContainer.classList.contains('active')) {
    return chartInstance;
  } else if (pertContainer && pertContainer.classList.contains('active')) {
    return pertChartInstance;
  }
  return null;
}
// --- Helper function to create unified toolbar handlers ---
function createChartHandler(methodName) {
  return () => {
    const activeChart = getActiveChart();
    if (activeChart && activeChart[methodName]) {
      // Call the corresponding method on the active chart instance
      activeChart[methodName]();
    } else {
      console.warn(`Action "${methodName}" not supported or no active chart found.`);
      // Optionally, provide user feedback here
      // alert(`Export type "${methodName.replace('saveAs', '')}" is not supported for the active chart.`);
    }
  };
}

createGanttChart();
createPertChart();
async function createGanttChart() {
  const response = await fetch('anyChart.json');
  const data = await response.json();
  // Create a tree data structure
  treeData = anychart.data.tree(data, "as-tree");

  // Create Gantt chart
  var chart = anychart.ganttProject();
//Assign to global variable here 
  chartInstance = chart;
  chart.data(treeData);

  chart.title().fontFamily("Inter, Helvetica, Arial");
  chart.tooltip().fontFamily("Inter, Helvetica, Arial");

  

  chart.defaultRowHeight(35);
  chart.headerHeight(105);
  // set the height of timeline elements
  chart.getTimeline().elements().height(20);


  // 3. ⚙️ DATA GRID CUSTOMIZATION (Columns, Buttons, Layout)
  var dataGrid = chart.dataGrid();

  chart.splitterPosition(650);

  // Helper: common title style
  function styleColumnTitle(col, text) {
    col.title().text(text);

    col.title().fontColor("#1e293b");
    col.title().fontWeight(700);
    col.title().fontSize(13);
    col.title().padding(5, 0, 5, 10);
    col.title().fontFamily("'Inter', Helvetica, Arial, sans-serif")
    return col;
  }
  // Helper: common label style
  function styleColumnLabels(col) {
    col.labels().fontColor("#334155");
    col.labels().fontSize(12);
    col.labels().padding(4, 0, 4, 10);

    return col;
  }

  // --- Column 2: Action Buttons ---
  let colAction = chart.dataGrid().column(5);
  styleColumnTitle(colAction, "Actions");
  colAction.width(110);


  colAction.labels().useHtml(true);
  colAction.collapseExpandButtons(false);
  colAction.depthPaddingMultiplier(0);

  colAction.labels().format(function () {
    const id = this.item && this.item.get ? this.item.get('id') : '';
    return `
      <div class="proj-action-group"  data-id="${id}">
       <button class="proj-action-btn" type="button" id="viewbtn" data-action="view" data-id="${id}" title="View Details">
          <span class="material-icons">visibility</span>
        </button>
        <button class="proj-action-btn" type="button" id="updatebtn" data-action="update" data-id="${id}" title="Update Task">
          <span class="material-icons">edit</span>
        </button>
         <button class="proj-action-btn" type="button" id="childbtn" data-action="addChild" data-id="${id}" title="Add Child Task">
          <span class="material-icons">add_circle_outline</span>
        </button>
      </div>
    `;
  });
  // --- Column 3: Project / Task Name ---
  let colTask = chart.dataGrid().column(1);
  styleColumnTitle(colTask, "Project / Task");
  styleColumnLabels(colTask);
  colTask.width(250);
  colTask.labels().useHtml(true);
  colTask.collapseExpandButtons(true);
  colTask.depthPaddingMultiplier(20);
  colTask.labels().format(function () {
    const name = this.item && this.item.get ? this.item.get('name') : '(Unnamed)';
    const safeName = String(name).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<span class="task-name" style="font-family: Inter, Helvetica, Arial, sans-serif">${safeName}</span>`;
  });
  colTask.labels().useHtml(true);
  // Conditionally bold parent vs child
  colTask.labels().format(function () {
    const item = this.item;
    const name = item && item.get ? item.get('name') : '(Unnamed)';
    const safeName = String(name).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Check if this item has children
    const isParent = item && item.numChildren && item.numChildren() > 0;
    const style = isParent
      ? 'font-weight:600; color:#0d47a1;font-family: Inter, Helvetica, Arial, sans-serif'  // bold and darker for parent
      : 'font-weight:400; color:#374151;font-family: Inter, Helvetica, Arial, sans-serif'; // normal for child
    return `<span style="${style}">${safeName}</span>`;
  });


  let colStart = chart.dataGrid().column(2);
  styleColumnTitle(colStart, "Start");
  styleColumnLabels(colStart);
  colStart.width(90);
  colStart.labels().format("{%actualStart}{dateTimeFormat:dd MMM yyyy}").fontFamily("Inter, Helvetica, Arial, sans-serif");


  // --- Column 5: End Date ---
  let colEnd = chart.dataGrid().column(3);
  styleColumnTitle(colEnd, "End");
  styleColumnLabels(colEnd);
  colEnd.width(90);
  colEnd.labels().format("{%actualEnd}{dateTimeFormat:dd MMM yyyy}");

  // --- Column 6: Progress ---
  let colProgress = chart.dataGrid().column(4);
  styleColumnTitle(colProgress, "Progress (%)");
  styleColumnLabels(colProgress);
  colProgress.width(80);
  colProgress.labels().format("{%progress}");


  // Button click handler
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".proj-action-btn");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!action || !id) return;
    performAction(action, id);
  });

  // 
  // --- Helper function to find nodes ---
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
    } catch (err) { }
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

  // --- Perform Actions ---
  function performAction(action, id) {
    const found = findTaskByIdFlexible(id);
    if (action === 'addChild') {
      console.log('Adding child for task ID:', id);
      fetch('https://example.com/api/add-child-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ parentId: id }),
      })
        .then(res => res.json())
        .then(data => {
          console.log('Add Child response:', data);
          alert(`Child task added under ID ${id}!`);
        })
        .catch(err => {
          console.error('Add Child error:', err);
          alert('Error adding child task.');
        });
    }

    // Update
    if (action === 'update') {
      console.log('Updating task ID:', id);
      fetch('https://example.com/api/update-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      })
        .then(res => res.json())
        .then(data => {
          console.log('Update response:', data);
          alert(`Task ${id} updated successfully!`);
        })
        .catch(err => {
          console.error('Update error:', err);
          alert('Error updating task.');
        });
    }

    // View
    if (action === 'view') {
      const node = found.node || found.raw;
      if (node) {
        const name = node.get ? node.get('name') : node.name;
        const start = node.get ? node.get('actualStart') : node.actualStart;
        const end = node.get ? node.get('actualEnd') : node.actualEnd;
        alert(`📋 Task: ${name}\nStart: ${start}\nEnd: ${end}`);
      }
      return;
    }
  }
  async function saveNewTaskToBackend(parentId, newName) {
    // 1. Prepare the minimal payload expected by your server
    const payload = {
      parentId: parentId,
      name: newName
      // The server will handle setting defaults for dates, progress, and generating the ID.
    };

    try {
      // 2. API Call: Replace 'https://your-api-url.com/addTask' with your actual endpoint
      const response = await fetch('https://your-api-url.com/addTask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        // Throw an error if the server response status is not 200-299
        throw new Error(`HTTP error! Status: ${response.status}. Failed to save task.`);
      }

      // 3. Optional: Read the server response (e.g., the new task ID, success message)
      // For this minimal case, we just check for success status.
      return await response.json();

    } catch (error) {
      console.error('API Error saving task:', error);
      // Re-throw the error to be caught by the caller
      throw new Error(`Failed to communicate with backend: ${error.message}`);
    }
  }

  chart.getTimeline().scale().maximumGap(1.2);
  // Expose globally
  window.chart = chart;

  chart.container("container");
  chart.contextMenu(false);
  //chart.fitAll();
  chart.draw();


  // Disable built-in context menu
  const menu = chart.contextMenu();
  menu.itemsFormatter(() => ({}));

  // --- Export Handlers ---
  // document.getElementById("savePNG").onclick = () => chart.saveAsPng();
  // document.getElementById("saveJPG").onclick = () => chart.saveAsJpg();
  // document.getElementById("saveSVG").onclick = () => chart.saveAsSvg();
  // document.getElementById("savePDF").onclick = () => chart.saveAsPdf();

  document.getElementById("savePNG").onclick =createChartHandler("saveAsPng");
  document.getElementById("saveJPG").onclick = createChartHandler("saveAsJpg");
  document.getElementById("saveSVG").onclick = createChartHandler("saveAsSvg");
  document.getElementById("savePDF").onclick = createChartHandler("saveAsPdf");

  // --- Data export handlers ---
  document.getElementById("saveCSV").onclick = createChartHandler("saveAsCsv");
  document.getElementById("saveXLSX").onclick = createChartHandler("saveAsXlsx");

  document.getElementById("printBtn").onclick = createChartHandler("print");

  // --- Fullscreen Handler (Updated to check active container) ---
  document.getElementById("fullscreenBtn").onclick = () => {
    const ganttContainer = document.getElementById('container');
    const pertContainer = document.getElementById('pertContainer');
    // Get the currently visible container
    const activeContainer = ganttContainer.classList.contains('active') ? ganttContainer :
      pertContainer.classList.contains('active') ? pertContainer : null;

    if (activeContainer) {
      if (!document.fullscreenElement) {
        activeContainer.requestFullscreen().catch(err => console.error("Fullscreen failed:", err));
      } else {
        document.exitFullscreen();
      }
    }
  };


}


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

    const duration = Math.max(1, (end - start) / (1000 * 60 * 60 * 24)); // days

    pertData.push({ id, name, duration });

    const connectTo = node.get("connectTo");
    if (connectTo) {
      dependencies.push({ from: connectTo, to: id });
    }

    const children = node.getChildren();
    for (let i = 0; i < children.length; i++) traverse(children[i]);
  }

  tree.getChildren().forEach(traverse);

  console.log(pertData);
  console.log(dependencies)
  //  PERT chart
  anychart.onDocumentReady(function () {
    const chart = anychart.pert();
    chart.data(pertData, "as-table", dependencies);
    //chart.title("PERT Chart");

    // chart.criticalPath().stroke("2 red");
    chart.milestones().labels().fontSize(10);
    duration = chart.getStat("pertChartProjectDuration");
    chart.verticalSpacing(70);
    chart.horizontalSpacing("89");
    chart.milestones().size(25);

    chart.criticalPath({ milestones: { fill: "#FF4040", selectFill: "#92000A" } });

    chart.contextMenu(true);
    // Assign to global variable here 
    pertChartInstance = chart;
    chart.container("pertContainer");
    chart.draw();
    // Disable built-in context menu
  const menu = chart.contextMenu();
  menu.itemsFormatter(() => ({}));
  });
}






