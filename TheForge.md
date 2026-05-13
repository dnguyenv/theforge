# **PRD: The Forge Protocol**

**Version:** 1.1.0

**Status:** Implementation-Ready for Engineering Agents

**Project Lead:** The Armorer

---

## **1\. Vision & Executive Summary**

In an era of synthetic saturation, **The Forge** is a decentralized protocol and suite of tools designed to prove the "Tempering" (human effort) of digital assets. Inspired by the philosophy of craft over convenience, it provides a cryptographic "Chain-Code" for art, ensuring that every pixel is the result of human "Strikes" rather than a single latent-space inference.

The goal is to move beyond simple AI-detection toward a positive **Proof-of-Process** standard.

---

## **2\. Core Concepts (The Foundry Lexicon)**

| Term | Technical Definition |
| :---- | :---- |
| **The Anvil** | The local-first, high-throughput event logging agent (Edge). |
| **The Strike** | A single atomic creative event (e.g., brush stroke, vertex move, code edit). |
| **The Tempering** | The process of cryptographically hashing and time-stamping "Strikes" into a Merkle Tree. |
| **The Chain-Code** | A Decentralized Identifier (DID) linked to the creator’s hardware secure enclave. |
| **The Armorer** | An observability/AI agent that analyzes work-logs for "Purity" (human entropy). |
| **The Beskar** | The final asset, containing an immutable C2PA manifest and a "Purity Grade." |

---

## **3\. Technical Architecture**

The system utilizes a **Local-First, Distributed Verification** model to ensure privacy and low-latency capture.

### **3.1 The Anvil (Edge Agent)**

* **Implementation:** Rust (for memory safety and zero-cost abstractions).  
* **Role:** Background daemon that interfaces with creative host applications (Photoshop, Blender, VS Code) via Wasm-based plugins or system-level input hooks.  
* **Throughput Requirement:** Support \>1,000 events per second with \<0.5% CPU overhead.

### **3.2 The Armorer (Observability Layer)**

* **Logic:** Uses statistical analysis (Entropy/Hurst Exponent) to distinguish human input patterns from "perfect" AI automation.  
* **Deployment:** Can run locally (for privacy) or as a trusted cloud-based oracle for high-stakes validation (e.g., art contests, legal IP claims).

---

## **4\. Functional Requirements**

### **4.1 "Strike" Capture (Work-Log)**

* **Requirement:** Capture telemetry including timestamp (ms), input pressure, velocity, tool ID, and coordinates.  
* **Privacy:** No pixel/visual data is captured. Only the *mathematics* of the movement.  
* **Tamper Resistance:** Periodic snapshots of the canvas are hashed and salted.

### **4.2 "Chain-Code" Signing**

* **Requirement:** Every session must be initialized with a signature from the user's Secure Enclave (Apple Silicon / TPM).  
* **Heartbeat:** The Anvil must generate a "Pulse" every 5 minutes. If a gap in pulses is detected without "Rest" markers, the Purity Grade is penalized (prevents offline "injection" of work).

### **4.3 "Beskar" Export (C2PA Integration)**

* **Requirement:** Upon file export, The Forge injects a JUMBF metadata block (C2PA standard).  
* **Validation:** The manifest must point to a URI containing the "Forging Record" (the public portion of the Merkle Tree).

---

## **5\. Technical Specifications for Agents**

### **5.1 "The Strike" Data Schema**

Agents should implement the following JSON-LD structure for event streams:

JSON  
{  
  "@context": "https://theforge.io/v1",  
  "type": "CreativeStrike",  
  "header": {  
    "chain\_code": "did:forge:ncsuee789...",  
    "session\_id": "anvil\_7782\_uuid",  
    "sequence\_id": 1402  
  },  
  "telemetry": {  
    "action": "BRUSH\_STROKE",  
    "input\_entropy": 0.874,  
    "duration\_ms": 420,  
    "delta\_hash": "sha256:7e8b..."  
  },  
  "proof": {  
    "timestamp": 1714695355,  
    "signature": "EdDSA:..."  
  }  
}

### **5.2 Key API Components**

* **Forge-Observer:** A gRPC-based interface for Host-App plugins to push events.  
* **The-Foundry-Sync:** A background synchronization service that pushes session Merkle roots to a decentralized ledger (e.g., Arweave or a private K8s cluster).

---

## **6\. Non-Functional Requirements**

* **Zero-Knowledge Process:** The protocol should eventually support Zero-Knowledge Proofs (ZKP), allowing an artist to prove "I worked on this for 20 hours" without revealing their specific brush movements or draft layers.  
* **Resilience:** The Anvil must handle network partitions. If the local machine is offline, the "Tempering" continues locally in an encrypted SQLite buffer.  
* **Authenticity Threshold:** The Armorer must maintain a False Positive Rate (FPR) of \<0.1% for professional human creators.

---

## **7\. User Stories**

| Role | Story | Acceptance Criteria |
| :---- | :---- | :---- |
| **Creator** | I want to "Forge" my art so that I can prove my style is mine. | The Anvil is active; Chain-Code is signed; Export contains C2PA seal. |
| **Collector** | I want to verify the "Purity" of a piece before purchasing. | Validator shows a 95%+ Human-Signature score. |
| **Platform** | I want to filter out "one-click" AI prompt results. | API returns purity\_grade: "Masterwork" for verified human assets. |

---

## **8\. Success Metrics (KPIs)**

* **Purity Score Adoption:** Number of digital marketplaces accepting Forge "Beskar" status.  
* **Platform Overhead:** Maintenance of \<50MB RAM footprint for the Anvil daemon.  
* **Integrity:** 0 reported cases of "AI-spoofing" successfully bypassing the Armorer’s entropy check in the first 6 months.

---

**Final Instruction to Agents:** \> Begin by scaffolding the **Anvil-Core** in Rust. Prioritize the event-bus and the cryptographic signing module using the host’s Secure Enclave. This is the way.

