import sys
import tkinter as tk
sys.stdout.reconfigure(encoding="utf-8")
from tkinter import filedialog
root = tk.Tk()
root.withdraw()
root.attributes('-topmost', True)
folder = filedialog.askdirectory(title='เลือกโฟลเดอร์ส่งออก Short Studio', mustexist=True)
root.destroy()
print(folder)
