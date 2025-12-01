import csv
import os
import random
import uuid
from typing import List, Dict, Any

from fastapi import FastAPI, Request, Response, Body
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

app = FastAPI()

# mount static and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# simple in-memory session store: session_id -> {questions: [...]}.
# Note: this is ephemeral (cleared on server restart). For production use a persistent store.
if not hasattr(app.state, "sessions"):
	app.state.sessions = {}

CSV_PATH = os.path.join(os.path.dirname(__file__), "knowledge.csv")
NUM_QUESTIONS = 50


def load_all_questions() -> List[Dict[str, Any]]:
	"""Load questions from knowledge.csv and return list of dicts.

	Expected CSV columns: 序号,题目内容,选项A,选项B,选项C,选项D,正确答案
	Returns normalized dicts with keys: id, question, options (list of strings), answer_letter
	"""
	rows = []
	if not os.path.exists(CSV_PATH):
		return rows
	with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
		reader = csv.DictReader(f)
		for r in reader:
			try:
				qid = r.get("序号") or r.get("id")
				question = r.get("题目内容") or r.get("question") or ""
				opts = [r.get("选项A", ""), r.get("选项B", ""),
				              r.get("选项C", ""), r.get("选项D", "")]
				answer_letter = (r.get("正确答案") or r.get("answer") or "").strip()
				rows.append({"id": str(qid), "question": question,
				            "options": opts, "answer_letter": answer_letter})
			except Exception:
				continue
	return rows


def prepare_session_questions(all_qs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
	"""Sample NUM_QUESTIONS from all_qs and shuffle options for each question.
	Returns list of questions with shuffled options and stores correct_index for server grading.
	Each question dict contains: id, question, options (list), _correct_index (internal)
	"""
	sampled = random.sample(all_qs, k=min(NUM_QUESTIONS, len(all_qs)))
	out = []
	for q in sampled:
		opts = list(q["options"])  # original order A,B,C,D
		# create pairs of (original_index, text)
		pairs = list(enumerate(opts))
		random.shuffle(pairs)
		shuffled_opts = [p[1] for p in pairs]
		# map original answer letter (A-D) to index
		letter = (q.get("answer_letter") or "").upper()
		letter_map = {"A": 0, "B": 1, "C": 2, "D": 3}
		orig_correct_idx = letter_map.get(letter, None)
		# find where original index ended up in shuffled list
		correct_index = None
		if orig_correct_idx is not None:
			for new_i, (orig_i, _) in enumerate(pairs):
				if orig_i == orig_correct_idx:
					correct_index = new_i
					break
		out.append({"id": q["id"], "question": q["question"],
		           "options": shuffled_opts, "_correct_index": correct_index})
	return out


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
	# On first access after container start, clear any existing session_id cookie
	# to avoid leftover invalid session ids from previous runs.
	marker = os.path.join(os.path.dirname(__file__), ".first_visit_done")
	first_visit = not os.path.exists(marker)
	if first_visit:
		# create marker file so this runs only once per container lifetime
		try:
			with open(marker, "w", encoding="utf-8") as f:
				f.write("visited")
		except Exception:
			pass

	response = templates.TemplateResponse("index.html", {"request": request, "first_visit": first_visit})
	if first_visit:
		# delete session_id cookie on client
		response.delete_cookie("session_id")
	return response


@app.get("/api/questions")
async def get_questions(request: Request):
	# simple session behavior: if client has session_id and server knows it, reuse; otherwise create one
	session_id = request.cookies.get("session_id")
	if session_id and session_id in app.state.sessions:
		session = app.state.sessions[session_id]
	else:
		all_qs = load_all_questions()
		prepared = prepare_session_questions(all_qs)
		session_id = str(uuid.uuid4())
		app.state.sessions[session_id] = {"questions": prepared}
		session = app.state.sessions[session_id]

	# return questions to client but strip internal _correct_index
	safe_questions = []
	for q in session["questions"]:
		safe_questions.append({"id": q["id"], "question": q["question"], "options": q["options"]})

	response = JSONResponse({"session": session_id, "questions": safe_questions})
	# set cookie so session persists across refreshes
	response.set_cookie("session_id", session_id, max_age=30 * 24 * 3600, httponly=True, samesite="lax")
	return response


@app.post("/api/submit")
async def submit_answers(payload: Dict = Body(...)):
	# payload expected: { session: <id>, answers: [{id: <qid>, choice: <index>} ...] }
	session_id = payload.get("session")
	answers = payload.get("answers", [])
	if not session_id or session_id not in app.state.sessions:
		return JSONResponse({"error": "invalid session"}, status_code=400)

	session = app.state.sessions[session_id]
	qmap = {q["id"]: q for q in session["questions"]}
	total = len(session["questions"])
	correct = 0
	for a in answers:
		qid = str(a.get("id"))
		choice = a.get("choice")
		if qid in qmap:
			correct_index = qmap[qid].get("_correct_index")
			try:
				if int(choice) == int(correct_index):
					correct += 1
			except Exception:
				continue

	percent = int(round((correct / total) * 100)) if total > 0 else 0
	result = {"score": percent}
	if percent >= 90:
		flag = os.environ.get("A1CTF_FLAG")
		if flag:
			result["flag"] = flag
		else:
			result["flag"] = "flag{INVALID_FLAG_CONTACT_ADMIN}"
	return JSONResponse(result)


if __name__ == "__main__":
	import uvicorn

	uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)

