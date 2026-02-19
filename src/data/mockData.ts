export interface JobDescription {
  id: string;
  filename: string;
  Job_Title: string;
  Company: string;
  Location: string;
  Experience: string;
  Education: string;
  Skills: string;
  Technology: string;
  Responsibilities: string;
  Qualifications: string;
  Salary: string;
  processedAt: string;
  candidateCount: number;
}

export interface Candidate {
  Rank: number;
  Candidate_ID: string;
  Name: string;
  Email: string;
  Category: string;
  Category_Confidence: number;
  "Semantic_Match (%)": number;
  "Tech_Match (%)": number;
  Matched_Tech_Skills: string[];
  Missing_Tech_Skills: string[];
  Portfolio_Type: string;
  Portfolio_URL?: string;
  Experience_Years?: number;
  Location?: string;
}

export const mockJDs: JobDescription[] = [
  {
    id: "jd-001",
    filename: "SeniorPythonDeveloper_JD.pdf",
    Job_Title: "Senior Python Developer",
    Company: "TechCorp Solutions",
    Location: "Remote / New York, USA",
    Experience: "5+ years",
    Education: "B.Sc. in Computer Science or related field",
    Skills: "Python, Django, REST APIs, PostgreSQL, Redis, Docker",
    Technology: "Python, Django, FastAPI, PostgreSQL, Redis, Docker, Kubernetes, AWS, Git, CI/CD",
    Responsibilities: "Design and develop scalable backend services, mentor junior developers, lead code reviews, architect microservices.",
    Qualifications: "Strong Python experience, familiarity with cloud platforms, experience with agile methodologies.",
    Salary: "$120,000 - $150,000 / year",
    processedAt: "2024-01-15T10:30:00Z",
    candidateCount: 24,
  },
  {
    id: "jd-002",
    filename: "DataScientist_JD.pdf",
    Job_Title: "Data Scientist",
    Company: "AnalyticsHub Inc.",
    Location: "London, UK",
    Experience: "3-6 years",
    Education: "M.Sc. or PhD in Data Science, Statistics, or related field",
    Skills: "Python, R, Machine Learning, Statistics, SQL, Data Visualization",
    Technology: "Python, TensorFlow, PyTorch, Scikit-learn, SQL, Tableau, Spark, Jupyter, Git",
    Responsibilities: "Build ML models, perform EDA, collaborate with product teams, deploy models to production.",
    Qualifications: "Solid understanding of statistics, experience with deep learning frameworks, strong communication skills.",
    Salary: "£70,000 - £90,000 / year",
    processedAt: "2024-01-14T09:00:00Z",
    candidateCount: 31,
  },
  {
    id: "jd-003",
    filename: "DevOpsEngineer_JD.pdf",
    Job_Title: "DevOps Engineer",
    Company: "CloudNative Ltd.",
    Location: "Berlin, Germany",
    Experience: "4+ years",
    Education: "B.Sc. in Computer Science or Engineering",
    Skills: "Docker, Kubernetes, CI/CD, Linux, Terraform, AWS",
    Technology: "Docker, Kubernetes, Terraform, AWS, Jenkins, GitLab CI, Prometheus, Grafana, Ansible, Linux",
    Responsibilities: "Manage cloud infrastructure, set up CI/CD pipelines, monitor system reliability, automate deployments.",
    Qualifications: "Strong Linux skills, experience with IaC tools, knowledge of container orchestration.",
    Salary: "€75,000 - €95,000 / year",
    processedAt: "2024-01-13T14:15:00Z",
    candidateCount: 18,
  },
  {
    id: "jd-004",
    filename: "WebDeveloper_React_JD.pdf",
    Job_Title: "React Web Developer",
    Company: "PixelForge Studios",
    Location: "Toronto, Canada",
    Experience: "2-5 years",
    Education: "B.Sc. in Computer Science or equivalent experience",
    Skills: "React, TypeScript, HTML, CSS, REST APIs, Git",
    Technology: "React, TypeScript, Next.js, Tailwind CSS, Node.js, GraphQL, REST APIs, Git, Jest",
    Responsibilities: "Build responsive web applications, implement UI/UX designs, collaborate with backend teams, write unit tests.",
    Qualifications: "Proficiency in React and TypeScript, experience with modern CSS frameworks, familiarity with testing.",
    Salary: "CAD $80,000 - $105,000 / year",
    processedAt: "2024-01-12T11:45:00Z",
    candidateCount: 42,
  },
];

export const mockCandidates: Record<string, Candidate[]> = {
  "jd-001": [
    {
      Rank: 1, Candidate_ID: "sarah.chen@email.com", Name: "Sarah Chen", Email: "sarah.chen@email.com",
      Category: "Python Developer", Category_Confidence: 0.9421,
      "Semantic_Match (%)": 88.4, "Tech_Match (%)": 90.0,
      Matched_Tech_Skills: ["python", "django", "fastapi", "postgresql", "redis", "docker", "aws", "git", "ci/cd"],
      Missing_Tech_Skills: ["kubernetes"],
      Portfolio_Type: "GitHub", Portfolio_URL: "https://github.com/sarahchen", Experience_Years: 6, Location: "New York, USA"
    },
    {
      Rank: 2, Candidate_ID: "arjun.patel@email.com", Name: "Arjun Patel", Email: "arjun.patel@email.com",
      Category: "Python Developer", Category_Confidence: 0.8893,
      "Semantic_Match (%)": 84.2, "Tech_Match (%)": 80.0,
      Matched_Tech_Skills: ["python", "django", "postgresql", "docker", "aws", "git", "redis", "ci/cd"],
      Missing_Tech_Skills: ["fastapi", "kubernetes"],
      Portfolio_Type: "GitHub", Portfolio_URL: "https://github.com/arjunpatel", Experience_Years: 5, Location: "Remote"
    },
    {
      Rank: 3, Candidate_ID: "maria.gonzalez@email.com", Name: "Maria Gonzalez", Email: "maria.gonzalez@email.com",
      Category: "Python Developer", Category_Confidence: 0.8654,
      "Semantic_Match (%)": 79.6, "Tech_Match (%)": 70.0,
      Matched_Tech_Skills: ["python", "fastapi", "postgresql", "docker", "git", "aws", "ci/cd"],
      Missing_Tech_Skills: ["django", "redis", "kubernetes"],
      Portfolio_Type: "Website", Portfolio_URL: "https://mariagonzalez.dev", Experience_Years: 4, Location: "Miami, USA"
    },
    {
      Rank: 4, Candidate_ID: "james.okafor@email.com", Name: "James Okafor", Email: "james.okafor@email.com",
      Category: "Python Developer", Category_Confidence: 0.7821,
      "Semantic_Match (%)": 71.3, "Tech_Match (%)": 60.0,
      Matched_Tech_Skills: ["python", "django", "postgresql", "git", "docker", "aws"],
      Missing_Tech_Skills: ["fastapi", "redis", "kubernetes", "ci/cd"],
      Portfolio_Type: "GitHub", Portfolio_URL: "https://github.com/jamesokafor", Experience_Years: 3, Location: "Lagos, Nigeria (Remote)"
    },
    {
      Rank: 5, Candidate_ID: "li.wei@email.com", Name: "Li Wei", Email: "li.wei@email.com",
      Category: "Python Developer", Category_Confidence: 0.7243,
      "Semantic_Match (%)": 65.8, "Tech_Match (%)": 50.0,
      Matched_Tech_Skills: ["python", "postgresql", "git", "docker", "aws"],
      Missing_Tech_Skills: ["django", "fastapi", "redis", "kubernetes", "ci/cd"],
      Portfolio_Type: "GitHub", Experience_Years: 2, Location: "Shanghai, China (Remote)"
    },
    {
      Rank: 6, Candidate_ID: "priya.sharma@email.com", Name: "Priya Sharma", Email: "priya.sharma@email.com",
      Category: "Data Science", Category_Confidence: 0.6911,
      "Semantic_Match (%)": 58.2, "Tech_Match (%)": 40.0,
      Matched_Tech_Skills: ["python", "postgresql", "git", "docker"],
      Missing_Tech_Skills: ["django", "fastapi", "redis", "kubernetes", "aws", "ci/cd"],
      Portfolio_Type: "Website", Experience_Years: 3, Location: "Bangalore, India (Remote)"
    },
    {
      Rank: 7, Candidate_ID: "tom.miller@email.com", Name: "Tom Miller", Email: "tom.miller@email.com",
      Category: "Java Developer", Category_Confidence: 0.7102,
      "Semantic_Match (%)": 48.9, "Tech_Match (%)": 30.0,
      Matched_Tech_Skills: ["postgresql", "docker", "git"],
      Missing_Tech_Skills: ["python", "django", "fastapi", "redis", "kubernetes", "aws", "ci/cd"],
      Portfolio_Type: "GitHub", Experience_Years: 5, Location: "Chicago, USA"
    },
  ],
  "jd-002": [
    {
      Rank: 1, Candidate_ID: "elena.voss@email.com", Name: "Elena Voss", Email: "elena.voss@email.com",
      Category: "Data Science", Category_Confidence: 0.9612,
      "Semantic_Match (%)": 91.2, "Tech_Match (%)": 88.9,
      Matched_Tech_Skills: ["python", "tensorflow", "pytorch", "scikit-learn", "sql", "tableau", "spark", "jupyter", "git"],
      Missing_Tech_Skills: [],
      Portfolio_Type: "GitHub", Experience_Years: 5, Location: "London, UK"
    },
    {
      Rank: 2, Candidate_ID: "ravi.krishna@email.com", Name: "Ravi Krishna", Email: "ravi.krishna@email.com",
      Category: "Data Science", Category_Confidence: 0.9144,
      "Semantic_Match (%)": 86.7, "Tech_Match (%)": 77.8,
      Matched_Tech_Skills: ["python", "tensorflow", "scikit-learn", "sql", "spark", "jupyter", "git"],
      Missing_Tech_Skills: ["pytorch", "tableau"],
      Portfolio_Type: "GitHub", Experience_Years: 4, Location: "Remote"
    },
  ],
  "jd-003": [
    {
      Rank: 1, Candidate_ID: "felix.mueller@email.com", Name: "Felix Müller", Email: "felix.mueller@email.com",
      Category: "DevOps Engineer", Category_Confidence: 0.9334,
      "Semantic_Match (%)": 89.5, "Tech_Match (%)": 90.0,
      Matched_Tech_Skills: ["docker", "kubernetes", "terraform", "aws", "jenkins", "prometheus", "grafana", "ansible", "linux"],
      Missing_Tech_Skills: ["gitlab ci"],
      Portfolio_Type: "GitHub", Experience_Years: 7, Location: "Berlin, Germany"
    },
  ],
  "jd-004": [
    {
      Rank: 1, Candidate_ID: "alex.thompson@email.com", Name: "Alex Thompson", Email: "alex.thompson@email.com",
      Category: "Web Developer", Category_Confidence: 0.9521,
      "Semantic_Match (%)": 93.1, "Tech_Match (%)": 100.0,
      Matched_Tech_Skills: ["react", "typescript", "next.js", "tailwind css", "node.js", "graphql", "rest apis", "git", "jest"],
      Missing_Tech_Skills: [],
      Portfolio_Type: "Website", Portfolio_URL: "https://alexthompson.dev", Experience_Years: 4, Location: "Toronto, Canada"
    },
    {
      Rank: 2, Candidate_ID: "nina.kowalski@email.com", Name: "Nina Kowalski", Email: "nina.kowalski@email.com",
      Category: "Web Developer", Category_Confidence: 0.8976,
      "Semantic_Match (%)": 85.4, "Tech_Match (%)": 77.8,
      Matched_Tech_Skills: ["react", "typescript", "tailwind css", "rest apis", "git", "jest", "node.js"],
      Missing_Tech_Skills: ["next.js", "graphql"],
      Portfolio_Type: "GitHub", Experience_Years: 3, Location: "Warsaw, Poland (Remote)"
    },
  ],
};

export const pipelineStats = {
  totalJDs: 4,
  totalCandidates: 115,
  avgTechMatch: 68.4,
  topMatchScore: 100.0,
  processedToday: 12,
  shortlisted: 23,
};
