# Vibe

Vibe is a **self-sovereign identity (SSI) framework** that gives users full control over their digital identity and data. It provides a **mobile app (vibe-app), an SDK (vibe-sdk), and react integration (vibe-react)**. Developers can build applications that interact with Vibe, enabling **seamless authentication and data sharing** without centralized storage or third-party intermediaries.

---

## 📁 Repository Structure

This repo is structured as follows:

| Project            | Description                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **`vibe-app`**     | Vibe mobile application. Built with **Expo/React Native**.                                                                           |
| **`vibe-desktop`** | Vibe desktop application. Built with **Electron + React Native**.                                                                    |
| **`vibe-web`**     | Vibe website hosted at [vibeapp.dev](vibeapp.dev) providing documentation and integration with the vibe app. Built with **Next.js**. |
| **`vibe-sdk`**     | JavaScript/TypeScript SDK that enables applications to interact with Vibe for authentication, data access, and permissions handling. |
| **`vibe-react`**   | React integration for Vibe, simplifying usage of Vibe within React applications.                                                     |
| **`vibe-cloud`**   | Vibe cloud enabling communication and data storage. Allows users to self-host their digital presence.                                |
| **`apps/*`**       | Web applications built on top of Vibe, using the Vibe SDK for authentication and data handling. Built using **Vite + React**.        |

---

## ⚙️ Getting Started

### 1️⃣ Install Dependencies

```bash
npm install
```

### 2️⃣ Build Libraries (First Time Only)

```bash
npm run build
```

This builds the core libraries (vibe-sdk and vibe-react) needed by the web applications.

### 3️⃣ Start Development

#### 🟢 Start the Mobile App

Ensure an emulator or device is set up, then run:

```bash
npm run app
```

#### 🌐 Start the Web Applications

The repository includes a streamlined development workflow:

```bash
# Start all web apps with auto-rebuilding of dependencies
npm run dev

# Start a specific app (e.g., contacts)
npm run dev contacts

# Start multiple apps simultaneously (e.g., web and contacts)
npm run dev web contacts

# See all available options
npm run dev --help
```

This command automatically watches for changes in vibe-sdk and vibe-react while running your selected applications.

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

Some documentation is available at:  
👉 **[vibeapp.dev/developers](https://vibeapp.dev/developers)**

Refer to the codebase and project structure for integration details and don't hesitate to reach out on the [Vibe Development Chat on Signal](https://signal.group/#CjQKILrCh74fbcqVeLI-q3FqkoDLoMJEcbx7kdXv-C04jcZPEhCVn3D5HPUc_d1oGXkJOtrK) if you have any questions.

---

## 📜 License

Vibe is open-source software released under the **MIT License**.
