# Vibe

Vibe is a **self-sovereign identity (SSI) framework** that gives users full control over their digital identity and data. It provides a **mobile app (vibe-app), an SDK (vibe-sdk), and react integration (vibe-react)**. Developers can build applications that interact with Vibe, enabling **seamless authentication and data sharing** without centralized storage or third-party intermediaries.

---

## 📁 Repository Structure

This repo is structured as follows:

| Project               | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| **`vibe-app`**        | Mobile application for managing self-sovereign identities. Built with **Expo/React Native**. |
| **`vibe-web`**        | Vibe website hosted at [vibeapp.dev](vibeapp.dev) providing documentation and integration with the vibe app. Built with **Next.js**. |
| **`vibe-sdk`**        | JavaScript/TypeScript SDK that enables applications to interact with Vibe for authentication, data access, and permissions handling. |
| **`vibe-react`**      | React integration for Vibe, simplifying usage of Vibe within React applications. |
| **`apps/*`**          | Web applications built on top of Vibe, using the Vibe SDK for authentication and data handling. Built using **Vite + React**. |

---

## ⚙️ Getting Started

### 1️⃣ Install Dependencies

```bash
npm install
```

### 2️⃣ Start Development

#### 🟢 Start the Mobile App

Ensure an Android emulator or device is available, then run:

```bash
npm run start-vibe-app
```

#### 🌐 Start the Web Apps

Build and watch the SDK:

```{bash
npm run watch-vibe-sdk
```

Then start any of the web applications:

```bash
npm run start-vibe-web      # Start the Vibe developer portal
npm run start-app-<appname> # Start a specific web app
```

---

## 🎯 Roadmap & Contributions

The current focus is on implementing the **core functionality** of Vibe, ensuring a robust foundation for **self-sovereign identity, secure authentication, and decentralized data interactions**. Developers getting involved now will be contributing at an early stage, helping shape the framework as it evolves.

### Contributing

1. Fork the repo & create a branch (`git checkout -b feature-name`).
2. Make changes & commit (`git commit -m "Add new feature"`).
3. Push your branch (`git push origin feature-name`).
4. Open a pull request.

---

## 📝 Documentation

Documentation will be available soon at:  
👉 **[vibeapp.dev/developers](https://vibeapp.dev/developers)**

For now, refer to the codebase and project structure for integration details.

---

## 📜 License

Vibe is open-source software released under the **MIT License**.
