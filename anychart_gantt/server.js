const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// Increase limit to handle large JSON trees
app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

const jsonFilePath = path.join(__dirname, "updated.json");

// ==========================================
// 1. Helper Functions (Tree Traversal)
// ==========================================

// Helper to read current data safely
function getGanttData() {
  if (!fs.existsSync(jsonFilePath)) return [];
  try {
    const raw = fs.readFileSync(jsonFilePath, "utf-8");
    return JSON.parse(raw) || [];
  } catch (e) {
    console.error("JSON Read Error:", e);
    return [];
  }
}

// Helper to save data
function saveGanttData(data) {
  try {
    fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (e) {
    console.error("JSON Write Error:", e);
    return false;
  }
}

// RECURSIVE FINDER: Searches tree for a node by ID
function findNodeById(nodes, id) {
  if (!nodes || !Array.isArray(nodes)) return null;

  for (let node of nodes) {
    // Check current node
    if (String(node.id) === String(id)) {
      return node;
    }
    // Check children recursively
    if (node.children && node.children.length > 0) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

// ==========================================
// 2. Endpoints
// ==========================================

// ➤ GET: Return current data
app.get("/api/gantt/data", (req, res) => {
  const data = getGanttData();
  res.json(data);
});

// ➤ POST: Bulk Save (Overwrites everything)
// Used by the "Export JSON" button logic
app.post("/api/gantt/save", (req, res) => {
  const body = req.body;
  if (saveGanttData(body)) {
    console.log("✅ Bulk saved updated.json");
    res.sendStatus(200);
  } else {
    res.status(500).json({ error: "Failed to save" });
  }
});

// ➤ POST: Update Single Task
// URL: /api/gantt/task/update
app.post("/api/gantt/task/update", (req, res) => {
  const updatePayload = req.body; // { id, name, progress... }
  const data = getGanttData();

  // Find the node in the tree
  const node = findNodeById(data, updatePayload.id);

  if (node) {
    // Merge existing node with new fields
    Object.assign(node, updatePayload);
    
    // Save back to file
    if (saveGanttData(data)) {
      console.log(`✅ Updated task: ${updatePayload.id}`);
      res.json(node); // Return updated node
    } else {
      res.status(500).json({ error: "File write failed" });
    }
  } else {
    res.status(404).json({ error: "Task ID not found" });
  }
});

// ➤ POST: Add Child Task
// URL: /api/gantt/task/add
app.post("/api/gantt/task/add", (req, res) => {
  const { parentId, ...taskData } = req.body;
  const data = getGanttData();

  // 1. Generate a real backend ID (replacing temp frontend ID if needed)
  const newId = "task_" + Date.now(); 
  
  const newTask = {
    ...taskData,
    id: newId, 
    children: [] // Initialize empty children
  };

  // 2. Determine where to add
  if (parentId) {
    // Find parent and push to children
    const parentNode = findNodeById(data, parentId);
    if (parentNode) {
      if (!parentNode.children) parentNode.children = [];
      parentNode.children.push(newTask);
    } else {
      return res.status(404).json({ error: "Parent ID not found" });
    }
  } else {
    // No parent = Root level task
    data.push(newTask);
  }

  // 3. Save
  if (saveGanttData(data)) {
    console.log(`✅ Added child task under ${parentId || "ROOT"}: ${newId}`);
    res.json(newTask); // Return the new task (with the REAL ID)
  } else {
    res.status(500).json({ error: "File write failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});