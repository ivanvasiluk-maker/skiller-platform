from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "docs" / "screens"
OUT.mkdir(parents=True, exist_ok=True)
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else REG, size)

INK = "#17362f"; MUTED = "#6d8078"; BG = "#eef1eb"; PAPER = "#fbfaf5"; GREEN = "#255c4d"

def rr(d, box, radius, fill, outline=None, width=1):
    d.rounded_rectangle(box, radius, fill=fill, outline=outline, width=width)

def wrap(d, text, f, width):
    words=text.split(); lines=[]; line=""
    for word in words:
        test=(line+" "+word).strip()
        if d.textlength(test,font=f)<=width: line=test
        else:
            if line: lines.append(line)
            line=word
    if line: lines.append(line)
    return lines

def txt(d, xy, text, size, fill=INK, bold=False, maxw=None, spacing=6, anchor=None):
    f=font(size,bold); x,y=xy
    if maxw:
        for line in wrap(d,text,f,maxw):
            d.text((x,y),line,font=f,fill=fill,anchor=anchor); y+=size+spacing
        return y
    d.text((x,y),text,font=f,fill=fill,anchor=anchor); return y+size

def character(d, cx, cy, color="#257461", soft="#dff1e9", mood="happy", scale=1):
    w=int(98*scale); h=int(88*scale)
    d.ellipse((cx-w*.58,cy-h*.45,cx-w*.28,cy-h*.12),fill="#ffbd6b")
    d.ellipse((cx+w*.28,cy-h*.45,cx+w*.58,cy-h*.12),fill="#ffbd6b")
    rr(d,(cx-w/2,cy-h/2,cx+w/2,cy+h/2),int(32*scale),soft,"#ffffff",2)
    ey=int(5*scale)
    if mood=="happy":
        d.arc((cx-w*.27,cy-h*.13,cx-w*.10,cy+h*.03),180,355,fill=color,width=max(2,ey//2))
        d.arc((cx+w*.10,cy-h*.13,cx+w*.27,cy+h*.03),180,355,fill=color,width=max(2,ey//2))
    else:
        d.ellipse((cx-w*.22,cy-h*.08,cx-w*.13,cy+h*.02),fill=color)
        d.ellipse((cx+w*.13,cy-h*.08,cx+w*.22,cy+h*.02),fill=color)
    d.arc((cx-w*.13,cy+h*.02,cx+w*.13,cy+h*.25),0,180,fill=color,width=max(2,int(3*scale)))

def phone(board, ox, oy, title, draw_content, number):
    d=ImageDraw.Draw(board)
    W,H=360,760
    rr(d,(ox,oy,ox+W,oy+H),36,"#17332d")
    rr(d,(ox+7,oy+7,ox+W-7,oy+H-7),31,PAPER)
    rr(d,(ox+130,oy+15,ox+230,oy+36),12,"#17332d")
    txt(d,(ox+18,oy-34),f"{number:02d}  {title}",18,INK,True)
    draw_content(d,ox+27,oy+50,W-54,H-78)

def button(d,x,y,w,label,primary=False,h=48):
    rr(d,(x,y,x+w,y+h),14,GREEN if primary else "#ffffff","#dbe3dc")
    txt(d,(x+w/2,y+h/2),label,11,"#ffffff" if primary else INK,True,anchor="mm")

def header(d,x,y,title,sub=""):
    txt(d,(x,y),"skiller·",20,INK,True)
    txt(d,(x,y+42),title,25,INK,True,maxw=290)
    if sub: txt(d,(x,y+104),sub,11,MUTED,maxw=290,spacing=4)

def welcome(d,x,y,w,h):
    txt(d,(x+w/2,y),"skiller·",24,INK,True,anchor="ma")
    character(d,x+w/2,y+155,scale=1.15)
    txt(d,(x,y+260),"КОГДА ТРУДНО",10,MUTED,True)
    txt(d,(x,y+285),"Не оставайтесь\nс этим один\nна один.",30,INK,True)
    txt(d,(x,y+410),"Расскажите, что происходит. Мы разберём ситуацию и сразу попробуем один маленький шаг.",11,MUTED,maxw=w,spacing=5)
    button(d,x,y+510,w,"Начать знакомство",True)

def coaches(d,x,y,w,h):
    header(d,x,y,"Кто будет рядом?","Тренера можно сменить позже. Память и прогресс сохранятся.")
    items=[("Марша","Бережная опора","#dff1e9","#257461"),("Бек","Спокойный анализ","#e7ebfa","#4b65a5"),("Скинни","Импульс к действию","#fae7da","#b75735")]
    yy=y+170
    for i,(name,role,soft,col) in enumerate(items):
        rr(d,(x,yy,x+w,yy+112),18,"#ffffff",col if i==0 else "#dfe5dc",2 if i==0 else 1)
        character(d,x+48,yy+56,col,soft,scale=.62)
        txt(d,(x+94,yy+22),role.upper(),8,col,True)
        txt(d,(x+94,yy+44),name,19,INK,True)
        txt(d,(x+94,yy+75),"Свой характер и стиль разговора",9,MUTED)
        yy+=124
    button(d,x,y+575,w,"Продолжить с Маршей",True)

def home(d,x,y,w,h):
    txt(d,(x,y),"skiller·",20,INK,True)
    rr(d,(x,y+48,x+w,y+255),24,"#dff1e9")
    txt(d,(x+18,y+68),"ПЯТНИЦА · ДЕНЬ 4",9,MUTED,True)
    txt(d,(x+18,y+98),"Иван, как Вы\nсегодня?",25,INK,True)
    character(d,x+w-68,y+175,scale=.78)
    rr(d,(x,y+270,x+w,y+345),16,"#ffffff","#dfe5dc")
    txt(d,(x+15,y+285),"ПРОДОЛЖИТЬ ВЧЕРАШНЕЕ",8,MUTED,True)
    txt(d,(x+15,y+307),"Открыть отчёт и написать заголовок",10,INK,True)
    txt(d,(x,y+375),"С чего начнём?",17,INK,True)
    for i,label in enumerate(["Рассказать\nситуацию","Сразу\nпрактика","Разобрать\nситуацию","Срочная\nопора"]):
        xx=x+(i%2)*(w/2+5); yy=y+410+(i//2)*112
        rr(d,(xx,yy,xx+w/2-5,yy+100),16,"#ffffff","#dfe5dc")
        txt(d,(xx+12,yy+20),label,11,INK,True)

def chat(d,x,y,w,h):
    txt(d,(x,y),"‹   Марша",16,INK,True); txt(d,(x+72,y+24),"на связи · помнит контекст",8,MUTED)
    yy=y+85
    bubbles=[("Марша","Расскажите, что сейчас происходит. Можно своими словами.",False),("Иван","Нужно закончить отчёт, но я уже час смотрю видео.",True),("Марша","Что сейчас нужнее: понять, где застряли, или сразу сделать первый шаг?",False)]
    for who,copy,user in bubbles:
        lines=wrap(d,copy,font(10),220); bh=30+len(lines)*15; bx=x+(45 if user else 0)
        rr(d,(bx,yy,bx+245,yy+bh),16,"#ffffff" if user else "#e7f1eb","#dfe5dc")
        txt(d,(bx+13,yy+10),who,8,MUTED,True)
        txt(d,(bx+13,yy+28),copy,10,INK,maxw=220,spacing=4)
        yy+=bh+14
    button(d,x,yy+10,w,"Сразу сделать первый шаг",False)
    rr(d,(x,y+590,x+w,y+644),17,"#ffffff","#dfe5dc"); txt(d,(x+15,y+610),"🎙  Сообщение тренеру…",10,MUTED)

def analysis(d,x,y,w,h):
    header(d,x,y,"Разбор ситуации","Вопрос 2 из 4 · по одному вопросу")
    rr(d,(x,y+150,x+w,y+240),18,"#edf3e9")
    character(d,x+45,y+195,scale=.5)
    txt(d,(x+87,y+168),"Я соберу цепочку вместе с Вами — без анкеты.",9,MUTED,maxw=200)
    rr(d,(x,y+258,x+w,y+470),20,"#ffffff","#dfe5dc")
    txt(d,(x+16,y+280),"МОМЕНТ ПЕРЕД ОТВЛЕЧЕНИЕМ",8,MUTED,True)
    txt(d,(x+16,y+320),"Что Вы сказали себе,\nкогда открыли отчёт?",21,INK,True)
    button(d,x+16,y+400,w-32,"«Отчёт получится плохим»",False)
    txt(d,(x,y+500),"СОБИРАЕМ ЦЕПОЧКУ",8,MUTED,True)
    txt(d,(x,y+530),"Отчёт  →  «сделаю плохо»  →  напряжение",9,INK,True)
    button(d,x,y+590,w,"Продолжить",True)

def practice(d,x,y,w,h):
    txt(d,(x,y),"‹   Практика",16,INK,True)
    character(d,x+w/2,y+125,scale=.9)
    txt(d,(x+w/2,y+208),"ОДИН ШАГ · 2 МИНУТЫ",9,MUTED,True,anchor="ma")
    txt(d,(x+w/2,y+238),"Откройте отчёт.\nБольше пока ничего.",23,INK,True,anchor="ma")
    txt(d,(x,y+330),"1   Закройте видео",11,INK,True)
    txt(d,(x+25,y+355),"Только на время этой попытки.",9,MUTED)
    txt(d,(x,y+400),"2   Откройте нужный файл",11,INK,True)
    txt(d,(x+25,y+425),"Остановитесь на первой странице.",9,MUTED)
    txt(d,(x,y+480),"▶   02:00     мягкий таймер",18,INK,True)
    button(d,x,y+550,w,"Файл открыт",True)
    button(d,x,y+610,w,"Шаг не подходит",False)

def result(d,x,y,w,h):
    txt(d,(x,y),"‹   Как получилось?",16,INK,True)
    character(d,x+w/2,y+135,scale=.9)
    txt(d,(x+w/2,y+220),"Попытка уже считается.",22,INK,True,anchor="ma")
    txt(d,(x+w/2,y+260),"Нам важен фактический результат.",9,MUTED,anchor="ma")
    yy=y+310
    for label,sub in [("Получилось","Шаг завершён"),("Частично","Начал, но остановился"),("Не получилось","Посмотрим, где оборвалась цепочка"),("Другой результат","Расскажу своими словами")]:
        rr(d,(x,yy,x+w,yy+65),15,"#edf7f2" if yy==y+310 else "#ffffff","#b8d5c8" if yy==y+310 else "#dfe5dc")
        txt(d,(x+15,yy+12),label,10,INK,True); txt(d,(x+15,yy+35),sub,8,MUTED); yy+=76

def returning(d,x,y,w,h):
    txt(d,(x,y),"skiller·",20,INK,True); character(d,x+w/2,y+150,scale=1)
    txt(d,(x,y+250),"БЕЗ ВИНЫ И ДОГОНЯНИЯ",9,MUTED,True)
    txt(d,(x,y+280),"Иван, мы потерялись\nна пару дней.",24,INK,True)
    txt(d,(x,y+355),"Всё нормально. Последний раз мы разбирали начало отчёта. Это ещё актуально?",10,MUTED,maxw=w)
    yy=y+435
    for label in ["Да, продолжим с отчётом","Появилось что-то важнее","Начнём просто с сегодня","Хочу ответить иначе"]:
        button(d,x,yy,w,label,yy==y+435); yy+=58

def journal(d,x,y,w,h):
    header(d,x,y,"Как прошёл день?","Дневник · около 40 секунд")
    yy=y+150
    for label,val in [("Настроение",6),("Интерес к жизни",5),("Энергия",4),("Отвлекаемость",8)]:
        txt(d,(x,yy),label,10,INK,True); txt(d,(x+w,yy),f"{val}/10",10,GREEN,True,anchor="ra")
        d.line((x,yy+28,x+w,yy+28),fill="#d6ddd8",width=4); d.line((x,yy+28,x+w*val/10,yy+28),fill=GREEN,width=4); d.ellipse((x+w*val/10-5,yy+23,x+w*val/10+5,yy+33),fill=GREEN); yy+=72
    rr(d,(x,yy,x+w,yy+78),14,"#ffffff","#dfe5dc"); txt(d,(x+12,yy+12),"Мысль дня",9,MUTED,True); txt(d,(x+12,yy+38),"Что хочется запомнить?",9,"#9aa59f")
    button(d,x,yy+94,w,"Сохранить день",True)

def insights(d,x,y,w,h):
    header(d,x,y,"SKILLER замечает связи","Дневник становится частью персонализации")
    rr(d,(x,y+155,x+w,y+315),20,"#e7ebfa")
    txt(d,(x+18,y+175),"НАБЛЮДЕНИЕ ЗА 4 ДНЯ",8,"#4b65a5",True)
    txt(d,(x+18,y+210),"Когда энергия ниже 5,\nначать рабочую задачу\nбыло сложнее.",17,INK,True)
    txt(d,(x+18,y+290),"Это гипотеза, а не диагноз.",8,MUTED)
    rr(d,(x,y+340,x+w,y+475),18,"#ffffff","#dfe5dc")
    txt(d,(x+16,y+360),"Что можно изменить",9,MUTED,True)
    txt(d,(x+16,y+395),"В дни с низкой энергией сразу предлагать более короткую практику.",11,INK,maxw=w-32)
    button(d,x,y+510,w,"Да, это похоже на мой опыт",True)
    button(d,x,y+570,w,"Нет, сейчас не подходит",False)

def profile(d,x,y,w,h):
    header(d,x,y,"Профиль","SK-000184 · тренер Марша")
    txt(d,(x,y+150),"Язык",15,INK,True)
    for i,(a,b) in enumerate([("Интерфейс","Русский"),("Разговор с тренером","Как пишу сейчас")]):
        yy=y+185+i*58; rr(d,(x,yy,x+w,yy+50),13,"#ffffff","#dfe5dc"); txt(d,(x+12,yy+16),a,9,MUTED); txt(d,(x+w-12,yy+16),b,9,INK,True,anchor="ra")
    txt(d,(x,y+325),"Оставаться на связи",15,INK,True)
    rr(d,(x,y+360,x+w,y+520),18,"#edf3e9")
    txt(d,(x+15,y+380),"Напомнить о договорённости",10,INK,True)
    txt(d,(x+15,y+410),"SKILLER напомнит завтра, даже если Вы не откроете приложение.",9,MUTED,maxw=w-30)
    button(d,x+15,y+458,w-30,"Включить push",True,40)
    txt(d,(x+w/2,y+530),"Добавить e-mail вместо push",9,GREEN,True,anchor="ma")

def critical(d,x,y,w,h):
    character(d,x+w/2,y+115,scale=.95)
    txt(d,(x,y+215),"РЕЖИМ ОТКРЫТ ВАМИ",9,"#9c5039",True)
    txt(d,(x,y+250),"Сейчас важна опора.",23,INK,True)
    txt(d,(x,y+295),"Я не буду автоматически расспрашивать. Выберите, что полезнее.",10,MUTED,maxw=w)
    yy=y+375
    for label in ["Короткое заземление","Связаться с человеком рядом","Контакты срочной помощи"]:
        button(d,x,yy,w,label,False); yy+=62
    txt(d,(x,y+595),"Если есть непосредственная опасность, обратитесь в местную экстренную службу.",8,"#8a7770",maxw=w)

boards=[
    ("01-знакомство.png",[("Старт",welcome),("Выбор тренера",coaches),("Сегодня",home)]),
    ("02-разговор-и-практика.png",[("Разговор",chat),("Разбор",analysis),("Практика",practice)]),
    ("03-результат-и-возвращение.png",[("Результат",result),("Возвращение через 2–3 дня",returning),("Дневник",journal)]),
    ("04-персонализация.png",[("Выводы дневника",insights),("Язык и напоминания",profile),("Критическая помощь",critical)]),
]

for filename, items in boards:
    image=Image.new("RGB",(1280,900),BG); d=ImageDraw.Draw(image)
    txt(d,(54,30),"SKILLER · UX ROUND 1",14,MUTED,True)
    txt(d,(54,55),filename.split('.')[0].replace('-',' ').upper(),24,INK,True)
    for i,(title,renderer) in enumerate(items): phone(image,45+i*410,115,title,renderer,i+1)
    image.save(OUT/filename,quality=94)

print("\n".join(str(OUT/f) for f,_ in boards))
