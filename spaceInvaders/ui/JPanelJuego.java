package spaceInvaders.ui;

import spaceInvaders.dominio.Alien;
import spaceInvaders.dominio.AlienDos;
import spaceInvaders.dominio.AlienTres;
import spaceInvaders.dominio.Nave;
import spaceInvaders.dominio.Proyectil;
import spaceInvaders.dominio.PNave;
import spaceInvaders.dominio.ObjetoJuego;
import spaceInvaders.util.Constantes;

import java.awt.Color;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Toolkit;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.KeyAdapter;
import java.awt.event.KeyEvent;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import javax.swing.JPanel;
import java.awt.event.KeyAdapter;
import java.awt.event.KeyEvent;

public class JPanelJuego extends JPanel implements ActionListener {
  public static int IMF = ObjetoJuego.IM1;

  ArrayList aliens = new ArrayList();
  Nave nave = new Nave();

  public JPanelJuego(int im){
    super(new GridLayout(3,10));
    this.setBackground(Color.black);
    this.addKeyListener(new JuegoKeyAdapter());
    this.setFocusable(true);
    this.configObjetos();
    this.IMF = im;
  }

  @Override
  public void paintComponent(Graphics g) {
    super.paintComponent(g);
    this.pintarTodo(g);
    //Toolkit.getDefaultToolkit().sync();
  }

  private void configObjetos(){
    int x = Constantes.X_INICIAL;
    int y = Constantes.Y_INICIAL;
    for(int i = 0;i<=Constantes.NUM_ALIENS-1;i++)
      aliens.add(new AlienDos(x+Constantes.SEPARACION_LATERAL*i+10,y));
    for(int i = 0;i<=Constantes.NUM_ALIENS-1;i++)
      aliens.add(new AlienDos(x+Constantes.SEPARACION_LATERAL*i+10,y+Constantes.SEPARACION_VERTICAL));
    for(int i = 0;i<=Constantes.NUM_ALIENS-1;i++)
      aliens.add(new Alien(x+Constantes.SEPARACION_LATERAL*i+5,y+2*Constantes.SEPARACION_VERTICAL));
    for(int i = 0;i<=Constantes.NUM_ALIENS-1;i++)
      aliens.add(new Alien(x+Constantes.SEPARACION_LATERAL*i+5,y+3*Constantes.SEPARACION_VERTICAL));
    for(int i = 0;i<=Constantes.NUM_ALIENS-1;i++)
      aliens.add(new AlienTres(x+Constantes.SEPARACION_LATERAL*i,y+4*Constantes.SEPARACION_VERTICAL));
    if(Constantes.PRIMERA_VEZ){
      nave = new Nave();
      Constantes.PRIMERA_VEZ = false;
    }
    Constantes.CONTADOR_MOVIMIENTO = Constantes.CONTADOR_MOVIMIENTO_INICIAL;
    this.repaint();
  }

  public void desplazarGrupo(){
    Iterator it = aliens.iterator();
    while(it.hasNext()){
      Alien alien = (Alien) it.next();
      alien.desplazar();
    }
    if (Constantes.CONTADOR_MOVIMIENTO == -(Constantes.CONTADOR_MOVIMIENTO_INICIAL)) {
      Constantes.CONTADOR_MOVIMIENTO = Constantes.CONTADOR_MOVIMIENTO_INICIAL;
      if(Constantes.RATIO_ACTUALIZACION_ALIENS > 3)
        Constantes.RATIO_ACTUALIZACION_ALIENS--;
    }
    Constantes.CONTADOR_MOVIMIENTO += -1;
  }

  private void pintarTodo(Graphics g) {
    Graphics2D g2d = (Graphics2D) g;
    Iterator it = aliens.iterator();
    while(it.hasNext()){
      Alien alien = (Alien) it.next();
      if(alien.isVisible()){
        g2d.drawImage(alien.getImagen(IMF), alien.getX(), alien.getY(), this);
        alien.getProyectil().mover();
        alien.getProyectil().comprobarPosicion();
        if (alien.getProyectil().isVisible())
          g2d.drawImage(alien.getProyectil().getImagen(IMF), alien.getProyectil().getX(), alien.getProyectil().getY(), this);
      }
    }
    if(nave.isVisible())
      if(Constantes.SECUENCIA_MUERTE == 0)
        g2d.drawImage(nave.getImagen(ObjetoJuego.IM1), nave.getX(), nave.getY(), this);
      if(Constantes.SECUENCIA_MUERTE == 1)
        g2d.drawImage(nave.getImagen(ObjetoJuego.IM2), nave.getX()-10, nave.getY()-10, this);
      if(Constantes.SECUENCIA_MUERTE == 2)
        g2d.drawImage(nave.getImagen(ObjetoJuego.IM3), nave.getX()-12, nave.getY()-10, this);
    nave.getProyectil().mover();
    if(nave.getProyectil().isVisible())
      g2d.drawImage(nave.getProyectil().getImagen(ObjetoJuego.IM1), nave.getProyectil().getX(), nave.getProyectil().getY(), this);
  }

  public void comprobarColision() {
    Iterator it = aliens.iterator();
    boolean todosMuertos = true;
    while(it.hasNext()){
      Alien alien = (Alien) it.next();
      if(alien.isVisible())
        todosMuertos = false;
      alien.comprobarColision(nave.getProyectil());
      nave.comprobarColision(alien.getProyectil(),this);
    }
    nave.getProyectil().comprobarPosicion();
    if(todosMuertos)
      this.configObjetos();
  }

  @Override
  public void actionPerformed(ActionEvent e){
    nave.mover();
    this.repaint(nave.getX()-1, nave.getY()-1,
                 nave.getAncho()+2, nave.getAltura()+2);
  }

  public void muerteNave(){
    Constantes.SECUENCIA_MUERTE = 1;
    this.repaint();
    this.esperar(5);
    Constantes.SECUENCIA_MUERTE = 2;
    this.repaint();
    this.esperar(5);
    Constantes.SECUENCIA_MUERTE = 0;
  }

  private void esperar(int i){
    try {
      Thread.sleep(i*50);
    }
    catch(Exception e){
    }
  }

  private class JuegoKeyAdapter extends KeyAdapter {
        @Override
        public void keyReleased(KeyEvent e) {
            nave.keyReleased(e);
        }
        @Override
        public void keyPressed(KeyEvent e) {
            nave.keyPressed(e);
        }
    }
}
