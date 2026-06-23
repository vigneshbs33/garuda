# 📋 Traffic Violations Fine Schedule & SMS Templates

This document stores the official SMS templates, penalty structures, and dispute policies under the Motor Vehicles (Amendment) Act. These templates are formatted to be used programmatically by the notification system to send real-time alerts and e-Challans.

---

## 📱 Global SMS Notification Template

This is the standard template sent to the offender's registered mobile number. The bracketed fields represent dynamic variables that the system populates during execution.

```text
Challan No: [CHALLAN_NUMBER] for Vehicle No: [VEHICLE_NUMBER] has been issued for traffic violation of [VIOLATION_DESCRIPTION] on [DATETIME].

Total Challan Amount: Rs. [AMOUNT]/-
For details, photo/video proof, and online payment visit official portal: https://echallan.parivahan.gov.in

If you wish to contest this violation, you may present your evidence at your local traffic police station or court to seek a cancellation.

- Digital Traffic Police, Govt. of India
```

> **Authorized Sender IDs:** `TM-ECHALN`, `VK-ECHALN`, `DL-ECHALN`, `MH-ECHALN` (State-specific prefixes ending in `ECHALN`)

---

## 🚦 Schedule of Offenses, Codes, & Fines

| Category | Violation Type | SMS Text Description (`[VIOLATION_DESCRIPTION]`) | Penalty Amount (`[AMOUNT]`) | Additional Penalties / Actions |
| :--- | :--- | :--- | :--- | :--- |
| **1. Two-Wheeler** | Helmet Non-Compliance | `Driving without protective headgear / helmet` | **₹1,000** | 3-Month DL Suspension |
| | Triple Riding | `Triple riding on two-wheeler / Carrying more than one pillion rider` | **₹1,000** | None |
| **2. Four-Wheeler** | Seatbelt Non-Compliance | `Driving without safety seat belt / Failing to wear seat belt` | **₹1,000** | None |
| | Stop-Line Violation | `Stop-line violation / Crossing the stop line at red signal` | **₹500 - ₹1,000** | Depends on obstruction level |
| **3. Dangerous** | Red-Light Violation | `Jumping red light / Signal violation` | **₹1,000 - ₹5,000** | License suspension or up to 6–12 months jail |
| | Wrong-Side Driving | `Driving against the established flow of traffic / Wrong side` | **₹1,000 - ₹5,000** | Dangerous driving charges |
| **4. Parking** | Illegal Parking | `Parking in a designated 'No Parking' zone / Obstructive parking` | **₹500** *(First)*<br>**₹1,500** *(Subsequent)* | Additional municipal towing charges |

---

## ⚖️ Official Grievance & Dispute Redressal Clause

If you believe an automated electronic e-Challan was issued in error (due to incorrect plate OCR, algorithmic misclassification, or a medical emergency), citizens have the legal right to contest it before it is forwarded to a Virtual Traffic Court.

### 🏢 Redressal Procedure:
1. **Visit Traffic Police Station:** Visit the local traffic police station or the office of the traffic authority holding jurisdiction over the logged violation coordinates.
2. **Present Evidence:** Present vehicle registration details, dashboard camera footage, or physical proof showing that the vehicle was not in violation or that the license plate was misread. The authorities can drop the charges and cancel the entry.
3. **Online Grievance Portal:** Lodge an online dispute on the official portal at [https://echallan.parivahan.gov.in](https://echallan.parivahan.gov.in) under the **"Grievance"** tab before the file transitions to a Virtual Court.
4. **Virtual Court Election:** If left unresolved, the citizen can contest the charge directly when it is routed to the online Virtual Court.
