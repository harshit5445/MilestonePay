# MilestonePay

MilestonePay is a platform designed to seamlessly manage freelance projects, securely track payments, and provide a dedicated support/resolution center for user disputes.

## Technologies Used
* **Backend:** Node.js, Express.js
* **Database:** MongoDB
* **Frontend:** EJS (Embedded JavaScript templates), HTML, CSS, Bootstrap

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) and [Git](https://git-scm.com/) installed on your computer.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/harshit5445/MilestonePay.git
   cd MilestonePay
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file in the root directory and add your MongoDB connection string and any other required variables:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   PORT=3000
   ```

4. **Run the application:**
   ```bash
   node app.js
   ```

5. **Open in Browser:**
   Visit `http://localhost:3000` to view the application.

## Features
* User Authentication & Role Management (Freelancers, Clients, Admins)
* Dashboard for tracking active and completed projects
* Earnings and Wallet management
* Resolution Center (Admin Ticket Management & Support)

---
*Created by [harshit5445](https://github.com/harshit5445)*
