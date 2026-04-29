// models/Project.js
const projectTemplate = {
    title: "",
    description: "",
    budget: 0,
    clientId: null,      // ID of the user who posted the job
    freelancerId: null,  // ID of the user who accepted the job (starts as null)
    status: "open",      // 'open' (in market), 'active' (hired), 'completed'
    milestones: [
        {
            id: 1,
            title: "",
            amount: 0,
            status: "Pending", // Pending -> Under Review -> Completed
            proof: ""
        }
    ]
};

module.exports = projectTemplate;