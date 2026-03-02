import pandas as pd

# FILE PATHS
responses_path = r"C:\Users\zaima.nabi\OneDrive - Save the Children International\Desktop\2026.03.01_TCSC26_Google form_Responses.csv"
rankings_path  = r"C:\Users\zaima.nabi\OneDrive - Save the Children International\Desktop\machine_learning_engineer_rankings (5).csv"

output_path = r"C:\Users\zaima.nabi\OneDrive - Save the Children International\Desktop\matched_filtered_DataPythonAI.csv"

# READ FILES
responses = pd.read_csv(responses_path)
rankings = pd.read_csv(rankings_path)

# 1️⃣ FILTER: Area of Interest contains "Data, Python & AI"
responses_filtered = responses[
    responses["Area of Interest"]
        .astype(str)
        .str.contains("Data, Python & AI", case=False, na=False)
].copy()

# 2️⃣ NORMALIZE EMAILS (avoid case/space mismatch)
responses_filtered["Email Address"] = (
    responses_filtered["Email Address"].str.strip().str.lower()
)
rankings["Email"] = (
    rankings["Email"].astype(str).str.strip().str.lower()
)

# 3️⃣ MATCH EMAILS (keep only matches)
matched = responses_filtered.merge(
    rankings,
    left_on="Email Address",
    right_on="Email",
    how="inner"
)

# 4️⃣ SAVE RESULT
matched.to_csv(output_path, index=False)

print("Matched rows:", len(matched))
print("Saved to:", output_path)