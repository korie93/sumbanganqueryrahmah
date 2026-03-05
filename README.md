# Sumbangan Query Rahmah

## Client User Manual
Untuk manual penggunaan client yang lengkap (split ikut role `superuser`, `admin`, `user`), rujuk:
- [README_CLIENT_MANUAL.md](./README_CLIENT_MANUAL.md)

## Description
Sumbangan Query Rahmah is a project designed to streamline and manage contributions effectively. It aims to provide a comprehensive solution for tracking donations, processing queries, and managing community support initiatives. This platform enables users to easily contribute and allows administrators to efficiently oversee and analyze the contributions made by the community.

## Tech Stack
- **Frontend:** React, Redux
- **Backend:** Node.js, Express
- **Database:** MongoDB
- **Authentication:** JSON Web Tokens (JWT)
- **Deployment:** Heroku, AWS

## Setup Instructions
1. **Clone the repository:**  
   ```bash  
   git clone https://github.com/korie93/sumbanganqueryrahmah.git  
   ```  

2. **Navigate into the directory:**  
   ```bash  
   cd sumbanganqueryrahmah  
   ```  

3. **Install dependencies for the backend:**  
   ```bash  
   cd server  
   npm install  
   ```  

4. **Install dependencies for the frontend:**  
   ```bash  
   cd ../client  
   npm install  
   ```  

5. **Set up environment variables:**  
   Create a `.env` file in the root of the server directory and specify the following variables:  
   - `MONGODB_URI` - Your MongoDB connection string  
   - `JWT_SECRET` - Secret key for JWT signing

6. **Start the server:**  
   ```bash  
   cd server  
   npm start  
   ```  

7. **Start the client:**  
   ```bash  
   cd ../client  
   npm start  
   ```  

## Features
- User registration and authentication
- Ability to make contributions
- Real-time tracking of contributions
- Admin dashboard for managing contributions
- Comprehensive analytics of donation data

## License
This project is licensed under the MIT License.
